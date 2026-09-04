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

setupTestDB();

// The Terms promise that cancelling a paid booking gets the guest their money
// back. nextBooq never moves money out of a cafe's Razorpay account, so the
// cancellation cannot issue the refund itself -- but it must not be silent
// about it either, or the promise has nothing behind it. Cancelling flags the
// reservation onto the cafe's refunds-owed queue instead.
describe('Refunds owed after a cancellation', () => {
  let cafe;
  let ownerToken;
  let managerToken;
  let guest;

  const makeReservation = (overrides = {}) =>
    Reservation.create({
      cafe_id: cafe._id,
      user_id: guest._id,
      table_ids: [],
      start_time: new Date(Date.now() + 5 * 60 * 60 * 1000),
      end_time: new Date(Date.now() + 6 * 60 * 60 * 1000),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'CONFIRMED',
      fee_policy: {
        adjusted_against_bill: true,
        refund_on_cancellation: true,
        cancellation_cutoff_hours: 24,
      },
      payment_data: {
        order_id: 'order_test',
        payment_id: 'pay_test',
        amount: 100,
        currency: 'INR',
        status: 'CAPTURED',
      },
      ...overrides,
    });

  const cancel = (reservation, token = ownerToken) =>
    request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CANCELLED', version: reservation.__v });

  const listRefunds = (token = ownerToken) =>
    request(app)
      .get(`/api/v1/cafes/${cafe._id}/refunds-owed`)
      .set('Authorization', `Bearer ${token}`);

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Refund Queue Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Refund Queue Cafe',
      slug: `refund-queue-${Date.now()}`,
      timezone: 'UTC',
      subscription_status: 'active',
    });
    await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });

    const owner = await User.create({
      name: 'Refund Owner',
      email: `refund-owner-${Date.now()}@test.com`,
      phone: `+1557${String(Date.now()).slice(-7)}`,
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [{ cafe_id: cafe._id, role: 'owner', permissions: [] }],
    });
    ownerToken = jwt.sign({ id: owner._id, tv: 0 }, config.JWT_SECRET, { expiresIn: '1h' });

    // A manager holds cancel_reservations but NOT manage_billing by default.
    const manager = await User.create({
      name: 'Refund Manager',
      email: `refund-manager-${Date.now()}@test.com`,
      phone: `+1558${String(Date.now()).slice(-7)}`,
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [
        {
          cafe_id: cafe._id,
          role: 'manager',
          permissions: ['view_reservations', 'edit_reservations', 'cancel_reservations'],
        },
      ],
    });
    managerToken = jwt.sign({ id: manager._id, tv: 0 }, config.JWT_SECRET, { expiresIn: '1h' });

    guest = await User.create({
      name: 'Refund Guest',
      email: `refund-guest-${Date.now()}@test.com`,
      phone: `+1559${String(Date.now()).slice(-7)}`,
      password_hash: 'pass',
      is_email_verified: true,
    });
  });

  test('cancelling a paid booking puts it on the refunds-owed queue', async () => {
    const reservation = await makeReservation();

    const res = await cancel(reservation);
    expect(res.status).toBe(200);

    const saved = await Reservation.findById(reservation._id);
    expect(saved.status).toBe('CANCELLED');
    expect(saved.payment_data.requires_manual_refund).toBe(true);
  });

  test('the queue lists the guest and the amount owed', async () => {
    const reservation = await makeReservation();
    await cancel(reservation);

    const res = await listRefunds();

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      amount: 100,
      currency: 'INR',
      payment_id: 'pay_test',
      status: 'CANCELLED',
    });
    expect(res.body.data[0].guest.email).toBe(guest.email);
  });

  test('an unpaid booking owes nothing when cancelled', async () => {
    // No payment was captured, so there is nothing to give back.
    const reservation = await makeReservation({
      status: 'PENDING_PAYMENT',
      payment_data: { order_id: 'order_test', payment_id: null, amount: 100, currency: 'INR' },
    });

    await cancel(reservation);

    const saved = await Reservation.findById(reservation._id);
    expect(saved.payment_data.requires_manual_refund).toBe(false);
    expect((await listRefunds()).body.data).toHaveLength(0);
  });

  test('a booking taken on non-refundable terms owes nothing when cancelled', async () => {
    // The terms recorded on the booking are what decides this -- not the
    // cafe's current setting.
    const reservation = await makeReservation({
      fee_policy: {
        adjusted_against_bill: false,
        refund_on_cancellation: false,
        cancellation_cutoff_hours: 24,
      },
    });

    await cancel(reservation);

    const saved = await Reservation.findById(reservation._id);
    expect(saved.payment_data.requires_manual_refund).toBe(false);
  });

  test('marking a refund settled clears it from the queue', async () => {
    const reservation = await makeReservation();
    await cancel(reservation);

    const res = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/refund-settled`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect((await listRefunds()).body.data).toHaveLength(0);
  });

  test('settling a refund requires manage_billing, not merely cancel rights', async () => {
    // The staff member who cancels is often not the one who controls the money.
    const reservation = await makeReservation();
    await cancel(reservation, managerToken);

    const res = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/refund-settled`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(403);
    // Still owed -- a denied click must not quietly clear the debt.
    expect((await listRefunds()).body.data).toHaveLength(1);
  });

  test('settling an already-settled refund does not silently succeed', async () => {
    const reservation = await makeReservation();
    await cancel(reservation);
    await request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/refund-settled`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const again = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/refund-settled`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(again.status).toBe(404);
  });

  test('the queue is scoped to the cafe', async () => {
    const otherOrg = await Organization.create({ name: 'Other Refund Org' });
    const otherCafe = await Cafe.create({
      org_id: otherOrg._id,
      name: 'Other Refund Cafe',
      slug: `other-refund-${Date.now()}`,
      timezone: 'UTC',
      subscription_status: 'active',
    });
    const reservation = await makeReservation();
    await cancel(reservation);

    const res = await request(app)
      .get(`/api/v1/cafes/${otherCafe._id}/refunds-owed`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(403);
  });
});
