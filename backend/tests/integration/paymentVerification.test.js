const request = require('supertest');
const crypto = require('crypto');
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

setupTestDB();

describe('Integration Test: Client-side payment verification endpoint', () => {
  let cafe;
  let user;
  let token;
  let reservation;
  const orderId = 'order_verify_123456';
  const paymentId = 'pay_verify_9999';

  const signCheckoutResponse = (razorpayOrderId, razorpayPaymentId) =>
    crypto
      .createHmac('sha256', 'fixture_key_secret')
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Verify Test Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Verify Cafe',
      slug: 'verify-cafe',
      timezone: 'UTC',
      payments: {
        razorpay_key_id: 'rzp_test_fixture',
        razorpay_key_secret_encrypted: encrypt('fixture_key_secret'),
        razorpay_webhook_secret_encrypted: encrypt('fixture_webhook_secret'),
        configured: true,
      },
    });
    user = await User.create({
      name: 'Verify User',
      email: 'verify@test.com',
      phone: '+1112225555',
      password_hash: 'pass',
    });
    token = jwt.sign({ id: user._id.toString() }, config.JWT_SECRET);

    const table = await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 2 });

    reservation = await Reservation.create({
      cafe_id: cafe._id,
      user_id: user._id,
      table_ids: [table._id],
      start_time: new Date('2026-08-20T19:00:00Z'),
      end_time: new Date('2026-08-20T20:30:00Z'),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'PENDING_PAYMENT',
      payment_data: { order_id: orderId, amount: 100, currency: 'INR', webhook_processed: false },
    });
  });

  test('confirms the reservation when the checkout signature is valid', async () => {
    const signature = signCheckoutResponse(orderId, paymentId);

    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/verify-payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CONFIRMED');

    const updated = await Reservation.findById(reservation._id);
    expect(updated.status).toBe('CONFIRMED');
    expect(updated.payment_data.payment_id).toBe(paymentId);
  });

  test('rejects and does not confirm when the signature is forged', async () => {
    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/verify-payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: 'deadbeef'.repeat(8),
      });

    expect(res.status).toBe(400);

    const updated = await Reservation.findById(reservation._id);
    expect(updated.status).toBe('PENDING_PAYMENT');
  });

  test('rejects when the order id does not belong to this reservation', async () => {
    const signature = signCheckoutResponse('order_someone_elses', paymentId);

    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/verify-payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpay_order_id: 'order_someone_elses',
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      });

    expect(res.status).toBe(400);

    const updated = await Reservation.findById(reservation._id);
    expect(updated.status).toBe('PENDING_PAYMENT');
  });

  describe('dev-mode unconfigured cafe payment verification', () => {
    const DEV_MOCK_KEY_SECRET = 'dev_mock_key_secret_not_a_real_razorpay_secret';

    const signWithDevMockKey = (razorpayOrderId, razorpayPaymentId) =>
      crypto
        .createHmac('sha256', DEV_MOCK_KEY_SECRET)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

    let devModeCafe;
    let devModeUser;
    let devModeReservation;
    let devModeToken;
    let originalEnv;

    beforeEach(async () => {
      // Create an unconfigured cafe (no payments configured)
      const org = await Organization.create({ name: 'Dev Mode Unconfigured Org' });
      devModeCafe = await Cafe.create({
        org_id: org._id,
        name: 'Dev Mode Unconfigured Cafe',
        slug: 'dev-mode-unconfigured',
        timezone: 'UTC',
        // No payments field — simulates unconfigured cafe
      });

      devModeUser = await User.create({
        name: 'Dev Mode User',
        email: 'devmode@test.com',
        phone: '+1112226666',
        password_hash: 'pass',
      });

      const devModeTable = await Table.create({ cafe_id: devModeCafe._id, table_number: 'T2', capacity: 2 });

      // Create a reservation with a mock order ID (as if created by dev-mode mock fallback)
      devModeReservation = await Reservation.create({
        cafe_id: devModeCafe._id,
        user_id: devModeUser._id,
        table_ids: [devModeTable._id],
        start_time: new Date('2026-08-21T19:00:00Z'),
        end_time: new Date('2026-08-21T20:30:00Z'),
        party_size: 2,
        reservation_timezone: 'UTC',
        status: 'PENDING_PAYMENT',
        payment_data: { order_id: 'order_mock_dev_12345', amount: 100, currency: 'INR', webhook_processed: false },
      });

      // Temporarily set NODE_ENV to development for this test
      originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      devModeToken = jwt.sign({ id: devModeUser._id.toString() }, config.JWT_SECRET);
    });

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    test('verifies payment for unconfigured cafe in development using hardcoded dev mock key', async () => {
      const signature = signWithDevMockKey('order_mock_dev_12345', 'pay_dev_12345');

      const res = await request(app)
        .post(`/api/v1/cafes/${devModeCafe._id}/reservations/${devModeReservation._id}/verify-payment`)
        .set('Authorization', `Bearer ${devModeToken}`)
        .send({
          razorpay_order_id: 'order_mock_dev_12345',
          razorpay_payment_id: 'pay_dev_12345',
          razorpay_signature: signature,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CONFIRMED');

      const updated = await Reservation.findById(devModeReservation._id);
      expect(updated.status).toBe('CONFIRMED');
      expect(updated.payment_data.payment_id).toBe('pay_dev_12345');
    });
  });
});
