const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const Reservation = require('../../src/models/Reservation');
const { setupTestDB } = require('../setup');
const { createOrderForReservation } = require('../../src/services/paymentService');
const { expireStalePendingPayments } = require('../../src/services/reservationExpiryService');
const { encrypt } = require('../../src/utils/encryption');

setupTestDB();

describe('Integration Test: PENDING_PAYMENT expiry', () => {
  let cafe;
  let table;
  let user;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Expiry Test Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Expiry Cafe',
      slug: 'expiry-cafe',
      timezone: 'UTC',
      payments: {
        razorpay_key_id: 'rzp_test_fixture',
        razorpay_key_secret_encrypted: encrypt('fixture_key_secret'),
        razorpay_webhook_secret_encrypted: encrypt('fixture_webhook_secret'),
        configured: true,
      },
    });
    user = await User.create({
      name: 'Expiry User',
      email: 'expiry@test.com',
      phone: '+1112229999',
      password_hash: 'pass',
      is_email_verified: true,
    });
    table = await Table.create({
      cafe_id: cafe._id,
      table_number: 'T1',
      capacity: 2,
    });
  });

  const makeReservation = async (overrides = {}) =>
    Reservation.create({
      cafe_id: cafe._id,
      user_id: user._id,
      table_ids: [table._id],
      start_time: new Date('2026-08-20T19:00:00Z'),
      end_time: new Date('2026-08-20T20:30:00Z'),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'PENDING_PAYMENT',
      payment_data: { order_id: 'order_x', amount: 100, currency: 'INR', webhook_processed: false },
      ...overrides,
    });

  test('createOrderForReservation stamps payment_data.expires_at in the future', async () => {
    const hold = await Reservation.create({
      cafe_id: cafe._id,
      user_id: user._id,
      table_ids: [table._id],
      start_time: new Date('2026-08-21T19:00:00Z'),
      end_time: new Date('2026-08-21T20:30:00Z'),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'HOLD',
      hold_expires_at: new Date(Date.now() + 10 * 60 * 1000),
    });

    const { reservation } = await createOrderForReservation(hold._id, cafe._id, 100);

    expect(reservation.status).toBe('PENDING_PAYMENT');
    expect(reservation.payment_data.expires_at).toBeInstanceOf(Date);
    expect(reservation.payment_data.expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  test('expireStalePendingPayments transitions a stale PENDING_PAYMENT reservation to EXPIRED', async () => {
    const stale = await makeReservation({
      payment_data: {
        order_id: 'order_stale',
        amount: 100,
        currency: 'INR',
        webhook_processed: false,
        expires_at: new Date(Date.now() - 60 * 1000),
      },
    });

    const result = await expireStalePendingPayments();

    expect(result.expiredCount).toBe(1);

    const updated = await Reservation.findById(stale._id);
    expect(updated.status).toBe('EXPIRED');
  });

  test('expireStalePendingPayments leaves reservations with a future expiry untouched', async () => {
    const fresh = await makeReservation({
      payment_data: {
        order_id: 'order_fresh',
        amount: 100,
        currency: 'INR',
        webhook_processed: false,
        expires_at: new Date(Date.now() + 60 * 1000),
      },
    });

    await expireStalePendingPayments();

    const updated = await Reservation.findById(fresh._id);
    expect(updated.status).toBe('PENDING_PAYMENT');
  });
});
