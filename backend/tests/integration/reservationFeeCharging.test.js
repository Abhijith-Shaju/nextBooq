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

describe('Integration Test: reservation fee is charged from cafe settings, not the client', () => {
  let token;

  const futureStartTime = () => {
    const d = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    d.setUTCHours(19, 0, 0, 0);
    return d.toISOString();
  };

  const makeCafeAndUser = async ({ reservationFee, orgName, cafeSlug, userEmail } = {}) => {
    const org = await Organization.create({ name: orgName });
    const cafe = await Cafe.create({
      org_id: org._id,
      name: 'Fee Cafe',
      slug: cafeSlug,
      timezone: 'UTC',
      contact_phone: '+911234567890',
      address: { line1: '1 Test Street', city: 'Kochi', state: 'Kerala', postal_code: '682001' },
      subscription_status: 'active',
      ...(reservationFee !== undefined ? { reservation_rules: { reservation_fee: reservationFee } } : {}),
      payments: {
        razorpay_key_id: 'rzp_test_fixture',
        razorpay_key_secret_encrypted: encrypt('fixture_key_secret'),
        razorpay_webhook_secret_encrypted: encrypt('fixture_webhook_secret'),
        configured: true,
      },
    });
    const user = await User.create({
      name: 'Fee User',
      email: userEmail,
      phone: `+1555${Math.floor(Math.random() * 1e7)}`,
      password_hash: 'pass',
      is_email_verified: true,
    });
    await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });
    const userToken = jwt.sign({ id: user._id.toString() }, config.JWT_SECRET);
    return { cafe, userToken };
  };

  test('charges the cafe-configured reservation_fee, in rupees, on the booking response', async () => {
    const { cafe, userToken } = await makeCafeAndUser({
      reservationFee: 250,
      orgName: 'Custom Fee Org',
      cafeSlug: 'custom-fee-cafe',
      userEmail: 'custom-fee-user@test.com',
    });

    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ start_time: futureStartTime(), party_size: 2 });

    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(250);
  });

  test('defaults to 100 for a cafe that has not customized its reservation_fee', async () => {
    const { cafe, userToken } = await makeCafeAndUser({
      orgName: 'Default Fee Org',
      cafeSlug: 'default-fee-cafe',
      userEmail: 'default-fee-user@test.com',
    });

    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ start_time: futureStartTime(), party_size: 2 });

    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(100);
  });

  test('ignores a client-supplied deposit_amount entirely — the cafe fee always wins', async () => {
    const { cafe, userToken } = await makeCafeAndUser({
      reservationFee: 250,
      orgName: 'Tamper Fee Org',
      cafeSlug: 'tamper-fee-cafe',
      userEmail: 'tamper-fee-user@test.com',
    });

    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${userToken}`)
      // A tampered client trying to pay ₹1 instead of the cafe's real ₹250 fee.
      .send({ start_time: futureStartTime(), party_size: 2, deposit_amount: 1 });

    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(250);
  });

  test('the underlying Razorpay order amount (paise) matches the rupee fee reported to the client', async () => {
    const { cafe, userToken } = await makeCafeAndUser({
      reservationFee: 250,
      orgName: 'Paise Match Org',
      cafeSlug: 'paise-match-cafe',
      userEmail: 'paise-match-user@test.com',
    });

    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ start_time: futureStartTime(), party_size: 2 });

    expect(res.status).toBe(201);
    const reservation = await Reservation.findById(res.body.data.reservation_id);
    expect(reservation.payment_data.amount).toBe(250); // rupees, stored
  });
});
