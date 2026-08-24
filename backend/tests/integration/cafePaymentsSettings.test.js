const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');

// Explicit local mock (mirroring the pattern used by other Razorpay-touching
// integration tests, e.g. concurrencyBooking.test.js / depositAmountValidation.test.js):
// `app` above is required before `../setup`, and jest.mock() calls are only
// hoisted within the file that declares them, so setup.js's own jest.mock of
// this module does not intercept the reference cafeController.js already
// captured when `app` was first required.
jest.mock('../../src/config/razorpay', () => ({
  createRazorpayClient: jest.fn(() => ({
    orders: {
      create: jest.fn().mockImplementation(async (options) => ({
        id: `order_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        entity: 'order',
        amount: options.amount,
        currency: options.currency || 'INR',
        receipt: options.receipt,
        status: 'created',
        created_at: Math.floor(Date.now() / 1000),
      })),
    },
    payments: {
      all: jest.fn().mockResolvedValue({ entity: 'collection', count: 0, items: [] }),
    },
  })),
}));

const { createRazorpayClient } = require('../../src/config/razorpay');

setupTestDB();

describe('Integration Test: cafe Payments settings (Razorpay credentials)', () => {
  let cafe;
  let ownerToken;
  let managerToken;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Payments Settings Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Payments Cafe',
      slug: 'payments-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });
    const owner = await User.create({
      name: 'Owner',
      email: 'owner-payments@test.com',
      phone: '+1555900002',
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [{ cafe_id: cafe._id, role: 'owner', permissions: [] }],
    });
    ownerToken = jwt.sign({ id: owner._id.toString() }, config.JWT_SECRET);

    // H-03: manager holds edit_settings by default, which used to be enough
    // to rewrite payment credentials. It must NOT be enough after the fix —
    // only manage_billing (owner-only, since no default role grants it) can.
    const manager = await User.create({
      name: 'Manager',
      email: 'manager-payments@test.com',
      phone: '+1555900003',
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [
        {
          cafe_id: cafe._id,
          role: 'manager',
          permissions: ['edit_tables', 'edit_settings', 'view_reservations', 'edit_reservations', 'cancel_reservations'],
        },
      ],
    });
    managerToken = jwt.sign({ id: manager._id.toString() }, config.JWT_SECRET);

    createRazorpayClient.mockClear();
  });

  const putSettings = (body) =>
    request(app).put(`/api/v1/cafes/${cafe._id}`).set('Authorization', `Bearer ${ownerToken}`).send(body);

  const putPayments = (body, token = ownerToken) =>
    request(app).put(`/api/v1/cafes/${cafe._id}/payments`).set('Authorization', `Bearer ${token}`).send(body);

  test('validates credentials against Razorpay before saving, and marks payments configured', async () => {
    const res = await putPayments({ razorpay_key_id: 'rzp_test_valid123', razorpay_key_secret: 'supersecretvalue' });

    expect(res.status).toBe(200);
    expect(res.body.data.payments.razorpay_key_id).toBe('rzp_test_valid123');
    expect(res.body.data.payments.configured).toBe(true);
    expect(res.body.data.payments.razorpay_key_secret_encrypted).toBeUndefined();

    expect(createRazorpayClient).toHaveBeenCalledWith({
      key_id: 'rzp_test_valid123',
      key_secret: 'supersecretvalue',
    });

    const persisted = await Cafe.findById(cafe._id);
    expect(persisted.payments.configured).toBe(true);
    expect(persisted.payments.razorpay_key_secret_encrypted).not.toBe('supersecretvalue');
    expect(persisted.payments.razorpay_key_secret_encrypted.length).toBeGreaterThan(0);
  });

  test('returns a one-time plaintext webhook URL and secret when payments are saved', async () => {
    const res = await putPayments({ razorpay_key_id: 'rzp_test_valid123', razorpay_key_secret: 'supersecretvalue' });

    expect(res.body.data.payments_webhook.url).toBe(
      `${config.FRONTEND_URL}/api/v1/webhooks/razorpay/payments-cafe`
    );
    expect(typeof res.body.data.payments_webhook.secret).toBe('string');
    expect(res.body.data.payments_webhook.secret.length).toBeGreaterThan(0);
  });

  test('a plain settings save (no payments) never touches payments_webhook', async () => {
    const res = await putSettings({ description: 'just a description update' });

    expect(res.status).toBe(200);
    expect(res.body.data.payments_webhook).toBeUndefined();
  });

  test('a plain settings save cannot smuggle in payment credentials', async () => {
    const res = await putSettings({
      description: 'trying to sneak payments in here',
      payments: { razorpay_key_id: 'rzp_test_sneaky', razorpay_key_secret: 'sneakysecret' },
    });

    expect(res.status).toBe(200);
    const persisted = await Cafe.findById(cafe._id);
    expect(persisted.payments.configured).toBe(false);
  });

  test('rejects the whole save when credentials fail Razorpay validation, persisting nothing', async () => {
    createRazorpayClient.mockReturnValueOnce({
      payments: { all: jest.fn().mockRejectedValue(new Error('Unauthorized')) },
    });

    const res = await putPayments({ razorpay_key_id: 'rzp_test_bad', razorpay_key_secret: 'wrongsecret' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/could not.*verif/i);

    const persisted = await Cafe.findById(cafe._id);
    expect(persisted.payments.configured).toBe(false);
  });

  test('rejects a payments update with only one of key_id/key_secret provided', async () => {
    const res = await putPayments({ razorpay_key_id: 'rzp_test_onlyid' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/razorpay_key_id.*razorpay_key_secret|razorpay_key_secret.*razorpay_key_id/i);
  });

  test('regenerates the webhook secret on a subsequent credentials replacement', async () => {
    const first = await putPayments({ razorpay_key_id: 'rzp_test_first', razorpay_key_secret: 'firstsecret' });
    const firstSecret = first.body.data.payments_webhook.secret;

    const second = await putPayments({ razorpay_key_id: 'rzp_test_second', razorpay_key_secret: 'secondsecret' });

    expect(second.body.data.payments.razorpay_key_id).toBe('rzp_test_second');
    expect(second.body.data.payments_webhook.secret).not.toBe(firstSecret);
  });

  // H-03
  test('a manager (edit_settings, not manage_billing) is forbidden from writing payment credentials', async () => {
    const res = await putPayments(
      { razorpay_key_id: 'rzp_test_manager_attempt', razorpay_key_secret: 'managersecret' },
      managerToken
    );

    expect(res.status).toBe(403);

    const persisted = await Cafe.findById(cafe._id);
    expect(persisted.payments.configured).toBe(false);
    expect(createRazorpayClient).not.toHaveBeenCalled();
  });

  test('the owner can still write payment credentials', async () => {
    const res = await putPayments(
      { razorpay_key_id: 'rzp_test_owner_ok', razorpay_key_secret: 'ownersecret' },
      ownerToken
    );

    expect(res.status).toBe(200);
    expect(res.body.data.payments.configured).toBe(true);
  });
});
