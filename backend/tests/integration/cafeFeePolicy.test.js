const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const Reservation = require('../../src/models/Reservation');
const { setupTestDB } = require('../setup');
const { encrypt } = require('../../src/utils/encryption');

jest.mock('../../src/config/razorpay', () => ({
  createRazorpayClient: jest.fn(() => ({
    orders: {
      create: jest.fn().mockImplementation(async (options) => ({
        id: `order_mock_${Date.now()}`,
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

setupTestDB();

// Cafes differ on what the reservation fee is: some adjust it against the
// final bill, others bill it separately and never refund it. Both are
// legitimate, but the guest has to be told which applies before paying, and
// the terms they agreed to must survive the cafe later changing its mind.
describe('Cafe reservation fee policy', () => {
  let cafe;
  let ownerToken;
  let guestToken;

  const bookingDate = () => {
    const d = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  };

  const updateRules = (rules) =>
    request(app)
      .put(`/api/v1/cafes/${cafe._id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ reservation_rules: rules });

  const book = () =>
    request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ date: bookingDate(), time: '19:00', party_size: 2 });

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Fee Policy Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Fee Policy Cafe',
      slug: `fee-policy-${Date.now()}`,
      timezone: 'Asia/Kolkata',
      subscription_status: 'active',
      reservation_rules: { booking_lead_time_hours: 1, reservation_fee: 100 },
      payments: {
        razorpay_key_id: 'rzp_test_fixture',
        razorpay_key_secret_encrypted: encrypt('fixture_key_secret'),
        razorpay_webhook_secret_encrypted: encrypt('fixture_webhook_secret'),
        configured: true,
      },
    });
    await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });

    const owner = await User.create({
      name: 'Fee Policy Owner',
      email: `fee-owner-${Date.now()}@test.com`,
      phone: `+1555${String(Date.now()).slice(-7)}`,
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [{ cafe_id: cafe._id, role: 'owner', permissions: [] }],
    });
    ownerToken = jwt.sign({ id: owner._id, tv: 0 }, config.JWT_SECRET, { expiresIn: '1h' });

    const guest = await User.create({
      name: 'Fee Policy Guest',
      email: `fee-guest-${Date.now()}@test.com`,
      phone: `+1556${String(Date.now()).slice(-7)}`,
      password_hash: 'pass',
      is_email_verified: true,
    });
    guestToken = jwt.sign({ id: guest._id, tv: 0 }, config.JWT_SECRET, { expiresIn: '1h' });
  });

  describe('defaults', () => {
    test('a cafe created without these settings keeps the originally published terms', async () => {
      // Existing cafes must not have their terms silently changed by this
      // feature shipping -- the platform previously promised an adjustable,
      // refundable fee, so that is what the defaults have to say.
      const fresh = await Cafe.findById(cafe._id);
      expect(fresh.reservation_rules.fee_adjusted_against_bill).toBe(true);
      expect(fresh.reservation_rules.refund_on_cancellation).toBe(true);
      expect(fresh.reservation_rules.cancellation_cutoff_hours).toBe(24);
    });
  });

  describe('settings validation', () => {
    test('an owner can switch the fee to separate and non-refundable', async () => {
      const res = await updateRules({
        fee_adjusted_against_bill: false,
        refund_on_cancellation: false,
        cancellation_cutoff_hours: 48,
      });

      expect(res.status).toBe(200);
      const saved = await Cafe.findById(cafe._id);
      expect(saved.reservation_rules.fee_adjusted_against_bill).toBe(false);
      expect(saved.reservation_rules.refund_on_cancellation).toBe(false);
      expect(saved.reservation_rules.cancellation_cutoff_hours).toBe(48);
    });

    test.each([
      ['a string', 'yes'],
      ['a number', 1],
      ['null', null],
    ])('rejects %s for fee_adjusted_against_bill', async (_label, value) => {
      // The numeric validation loops skip anything they do not recognise, so
      // without an explicit boolean check these would reach the schema and be
      // coerced into a policy the cafe never chose.
      const res = await updateRules({ fee_adjusted_against_bill: value });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/must be true or false/i);
    });

    test('rejects a non-boolean refund_on_cancellation', async () => {
      const res = await updateRules({ refund_on_cancellation: 'maybe' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/must be true or false/i);
    });

    test.each([
      ['negative', -1],
      ['fractional', 2.5],
      ['absurdly large', 24 * 30 + 1],
    ])('rejects a %s cancellation_cutoff_hours', async (_label, value) => {
      const res = await updateRules({ cancellation_cutoff_hours: value });
      expect(res.status).toBe(400);
    });

    test('accepts a zero-hour cutoff (cancel any time up to the booking)', async () => {
      const res = await updateRules({ cancellation_cutoff_hours: 0 });
      expect(res.status).toBe(200);
      const saved = await Cafe.findById(cafe._id);
      expect(saved.reservation_rules.cancellation_cutoff_hours).toBe(0);
    });
  });

  describe('the policy is published to the guest before they pay', () => {
    test('the public cafe payload carries the fee terms', async () => {
      await updateRules({ fee_adjusted_against_bill: false, refund_on_cancellation: false });

      const res = await request(app).get(`/api/v1/cafes/slug/${cafe.slug}`);

      expect(res.status).toBe(200);
      expect(res.body.data.reservation_rules).toMatchObject({
        fee_adjusted_against_bill: false,
        refund_on_cancellation: false,
      });
    });
  });

  describe('the terms are snapshotted onto the reservation', () => {
    test('a booking records the policy in force when it was made', async () => {
      await updateRules({
        fee_adjusted_against_bill: false,
        refund_on_cancellation: false,
        cancellation_cutoff_hours: 12,
      });

      const res = await book();
      expect(res.status).toBe(201);

      const saved = await Reservation.findById(res.body.data.reservation_id);
      expect(saved.fee_policy).toMatchObject({
        adjusted_against_bill: false,
        refund_on_cancellation: false,
        cancellation_cutoff_hours: 12,
      });
    });

    test('changing the cafe policy afterwards does not rewrite an existing booking', async () => {
      // The whole point of snapshotting: a cafe cannot take a refundable fee
      // on Monday, switch to non-refundable on Tuesday, and then refuse the
      // refund on the strength of the new setting.
      const res = await book();
      expect(res.status).toBe(201);
      const reservationId = res.body.data.reservation_id;

      const before = await Reservation.findById(reservationId);
      expect(before.fee_policy.refund_on_cancellation).toBe(true);

      await updateRules({ refund_on_cancellation: false, fee_adjusted_against_bill: false });

      const after = await Reservation.findById(reservationId);
      expect(after.fee_policy.refund_on_cancellation).toBe(true);
      expect(after.fee_policy.adjusted_against_bill).toBe(true);
    });

    test('fee_policy is immutable once written', async () => {
      const res = await book();
      const reservation = await Reservation.findById(res.body.data.reservation_id);

      reservation.fee_policy.refund_on_cancellation = false;
      await reservation.save();

      const reloaded = await Reservation.findById(reservation._id);
      expect(reloaded.fee_policy.refund_on_cancellation).toBe(true);
    });
  });
});
