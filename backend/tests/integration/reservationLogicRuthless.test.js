const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const Reservation = require('../../src/models/Reservation');
const { setupTestDB } = require('../setup');

jest.mock('../../src/config/razorpay', () => ({
  createRazorpayClient: jest.fn(() => ({
    orders: {
      create: jest.fn().mockImplementation(async (options) => ({
        id: `order_mock_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
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

// The reservation lead-time floor rejects anything less than ~24h out, and
// the midnight-crossing test below depends on the date landing on a
// Wednesday — so this computes a safely-future Wednesday instead of a fixed
// calendar date, which would eventually rot into the past as real time
// moves on (as happened with the previous hardcoded '2026-08-12').
function nextWednesdayAtLeast48hOut() {
  const d = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const diff = (3 - d.getUTCDay() + 7) % 7; // Wednesday = 3
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

const TEST_DATE = nextWednesdayAtLeast48hOut();

const signWebhook = (payload) =>
  crypto
    .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET || 'rzp_test_webhook_secret')
    .update(JSON.stringify(payload))
    .digest('hex');

describe('Ruthless reservation logic audit', () => {
  let cafe, customerToken, customerUser, table;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Ruthless Test Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Grill Cafe',
      slug: `grill-cafe-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timezone: 'UTC',
      subscription_status: 'active',
    });

    customerUser = await User.create({
      name: 'Ruthless Customer',
      email: `ruthless-${Date.now()}@test.com`,
      phone: '+1999888700',
      password_hash: 'secret',
    });
    customerToken = jwt.sign({ id: customerUser._id.toString() }, config.JWT_SECRET);

    table = await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });
  });

  test('FIXED: rejects a reservation entirely in the past (booking_lead_time_hours enforced)', async () => {
    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        start_time: '2020-01-01T12:00:00.000Z', // Wednesday
        party_size: 2,
        duration_minutes: 60,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/advance/i);
  });

  test('FIXED: enforces max_party_size even when tables physically fit', async () => {
    await Table.create({ cafe_id: cafe._id, table_number: 'BIG1', capacity: 20 });

    // Default max_party_size is 12.
    const overMax = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ start_time: `${TEST_DATE}T12:00:00.000Z`, party_size: 20, duration_minutes: 60 });
    expect(overMax.status).toBe(400);
    expect(overMax.body.message).toMatch(/maximum/i);

    const atMax = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ start_time: `${TEST_DATE}T12:00:00.000Z`, party_size: 12, duration_minutes: 60 });
    expect(atMax.status).toBe(201); // still fits on the size-20 table, and 12 is allowed
  });

  test('FIXED: same user cannot hold two overlapping reservations at the same cafe', async () => {
    await Table.create({ cafe_id: cafe._id, table_number: 'T2', capacity: 4 });

    const first = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ start_time: `${TEST_DATE}T12:00:00.000Z`, party_size: 2, duration_minutes: 60 });
    expect(first.status).toBe(201);

    // Same user, same cafe, overlapping window — a second table is physically available,
    // but the booking should still be rejected as a duplicate/overlap for this user.
    const second = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ start_time: `${TEST_DATE}T12:15:00.000Z`, party_size: 2, duration_minutes: 60 });

    expect(second.status).toBe(409);

    const reservations = await Reservation.find({ user_id: customerUser._id });
    expect(reservations.length).toBe(1);

    // A non-overlapping slot for the same user should still succeed.
    const nonOverlapping = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ start_time: `${TEST_DATE}T15:00:00.000Z`, party_size: 2, duration_minutes: 60 });
    expect(nonOverlapping.status).toBe(201);
  });

  test('FIXED: duration_minutes: 0 is rejected instead of silently defaulting to 90', async () => {
    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ start_time: `${TEST_DATE}T12:00:00.000Z`, party_size: 2, duration_minutes: 0 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/duration_minutes/i);
  });

  test('FIXED: negative duration_minutes returns a clean 400 instead of a 500', async () => {
    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ start_time: `${TEST_DATE}T12:00:00.000Z`, party_size: 2, duration_minutes: -30 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/duration_minutes/i);
  });

  test('FIXED: party_size rejects a non-numeric string instead of silently truncating it ("3abc")', async () => {
    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ start_time: `${TEST_DATE}T12:00:00.000Z`, party_size: '3abc', duration_minutes: 60 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/party_size/i);
  });

  test('FIXED: reservation crossing midnight is rejected against the closing time', async () => {
    await Cafe.findByIdAndUpdate(cafe._id, {
      operating_hours: [
        { day_of_week: 'wednesday', open_time: '09:00', close_time: '22:00', is_closed: false },
        { day_of_week: 'thursday', open_time: '09:00', close_time: '22:00', is_closed: false },
      ],
    });

    // TEST_DATE is a Wednesday. Start at 23:50 Wed, end at 00:30 Thu — past
    // Wednesday's 22:00 close once day-rollover is accounted for.
    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ start_time: `${TEST_DATE}T23:50:00.000Z`, party_size: 2, duration_minutes: 40 });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/closing time/i);
  });

  test('sanity: a same-day booking that legitimately runs late but stays within close_time still succeeds', async () => {
    await Cafe.findByIdAndUpdate(cafe._id, {
      operating_hours: [
        { day_of_week: 'wednesday', open_time: '09:00', close_time: '23:30', is_closed: false },
      ],
    });

    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ start_time: `${TEST_DATE}T22:50:00.000Z`, party_size: 2, duration_minutes: 30 }); // ends 23:20, same day

    expect(res.status).toBe(201);
  });

  test('BUG: booking exactly at opening time on a day with no explicit schedule succeeds (default 09:00-22:00), but the closing-time boundary is off-by-one via strict "<"', async () => {
    // No operating_hours entries at all -> defaults to 09:00-22:00 for every day.
    const exactClose = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ start_time: `${TEST_DATE}T21:30:00.000Z`, party_size: 2, duration_minutes: 30 }); // ends exactly 22:00

    expect(exactClose.status).toBe(201); // end === close_time is allowed (endDetails.timeString > closeTime is false) — expected & fine

    const pastClose = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ start_time: `${TEST_DATE}T21:31:00.000Z`, party_size: 2, duration_minutes: 30 }); // ends 22:01

    expect(pastClose.status).toBe(422); // sanity check: one minute past close is correctly rejected
  });

  test('FIXED: payment.failed webhook on a still-HOLD reservation cancels it and releases the table', async () => {
    const bookingRes = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ start_time: `${TEST_DATE}T12:00:00.000Z`, party_size: 2, duration_minutes: 60 });
    expect(bookingRes.status).toBe(201);

    // Force the reservation back to HOLD to simulate the payment-order-creation-failed
    // path (paymentService expires it) OR any other route that leaves it in HOLD with
    // an order_id attached. webhookController explicitly special-cases HOLD:
    //   if (currentStatus === 'PENDING_PAYMENT' || currentStatus === 'HOLD') { ... targetStatus: 'CANCELLED' ... }
    // VALID_TRANSITIONS.HOLD now includes 'CANCELLED' so this transition succeeds.
    const reservationId = bookingRes.body.data.reservation_id;
    const orderId = bookingRes.body.data.razorpay_order_id;
    await Reservation.findByIdAndUpdate(reservationId, { status: 'HOLD' });

    const webhookPayload = {
      event: 'payment.failed',
      payload: { payment: { entity: { id: 'pay_fail_1', order_id: orderId, status: 'failed' } } },
    };

    const webhookRes = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('x-razorpay-signature', signWebhook(webhookPayload))
      .send(webhookPayload);

    expect(webhookRes.status).toBe(200);

    const dbRes = await Reservation.findById(reservationId);
    expect(dbRes.status).toBe('CANCELLED');
    expect(dbRes.payment_data.webhook_processed).toBe(true);

    // Table should now be free for a new booking in the same slot.
    const rebook = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ start_time: `${TEST_DATE}T12:00:00.000Z`, party_size: 2, duration_minutes: 60 });
    expect(rebook.status).toBe(201);
  });

  test('GAP: no cancellation path exists once a reservation reaches CHECKED_IN', async () => {
    const bookingRes = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ start_time: `${TEST_DATE}T12:00:00.000Z`, party_size: 2, duration_minutes: 60 });
    const reservationId = bookingRes.body.data.reservation_id;
    await Reservation.findByIdAndUpdate(reservationId, { status: 'CHECKED_IN', __v: 5 });

    const { transitionState } = require('../../src/services/stateMachine');
    await expect(
      transitionState({
        reservationId,
        tenantId: cafe._id,
        targetStatus: 'CANCELLED',
        expectedVersion: 5,
      })
    ).rejects.toThrow(/Illegal status transition/);
    // CHECKED_IN -> [SEATED, LEFT_BEFORE_SEATING] only. A no-show who checked in but
    // never gets seated cannot be cancelled — only LEFT_BEFORE_SEATING, which does not
    // release the table via a distinct "cancelled" accounting bucket.
  });

  test('boundary: party_size exactly equal to table capacity is a valid single-table fit (sanity check)', async () => {
    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ start_time: `${TEST_DATE}T12:00:00.000Z`, party_size: 4, duration_minutes: 60 });
    expect(res.status).toBe(201);
    const dbRes = await Reservation.findById(res.body.data.reservation_id);
    expect(dbRes.table_ids.length).toBe(1);
  });

  test('boundary: party_size one over capacity with no mergeable second table is correctly rejected', async () => {
    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ start_time: `${TEST_DATE}T12:00:00.000Z`, party_size: 5, duration_minutes: 60 });
    expect(res.status).toBe(422);
  });

  test('sanity: an expired HOLD correctly releases its table for reallocation, even for the same user', async () => {
    // Different user creates and abandons the hold, so the follow-up booking by
    // customerUser below isn't itself blocked by the new overlap check.
    const otherUser = await User.create({
      name: 'Other Customer',
      email: `other-${Date.now()}@test.com`,
      phone: '+1999888701',
      password_hash: 'secret',
    });
    const otherToken = jwt.sign({ id: otherUser._id.toString() }, config.JWT_SECRET);

    const bookingRes = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ start_time: `${TEST_DATE}T12:00:00.000Z`, party_size: 2, duration_minutes: 60 });
    const firstId = bookingRes.body.data.reservation_id;

    // Force it back to an expired HOLD (simulating a lapsed, unpaid hold).
    await Reservation.findByIdAndUpdate(firstId, {
      status: 'HOLD',
      hold_expires_at: new Date(Date.now() - 60 * 1000),
    });

    const second = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ start_time: `${TEST_DATE}T12:00:00.000Z`, party_size: 2, duration_minutes: 60 });

    expect(second.status).toBe(201);
  });

  test('FIXED: a walk-in-speed "reservation" a few seconds out is rejected by the lead-time floor', async () => {
    const almostNow = new Date(Date.now() + 5000); // 5 seconds from now
    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        start_time: almostNow.toISOString(),
        party_size: 2,
        duration_minutes: 60,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/advance/i);
  });
});
