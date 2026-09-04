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

// POST /reservations accepts the cafe's own wall clock (date + time), the same
// shape the availability search already speaks, and resolves it server-side
// using the cafe's timezone.
//
// Previously it took a pre-converted `start_time`, which made every client
// responsible for a conversion it had no authority to perform -- the web app
// resolved the slot in the *browser's* timezone, so a diner whose device sat
// on any other zone booked a different slot than the one they tapped and paid
// a deposit for it. These assertions are absolute instants, so they hold
// regardless of the timezone the test runner sits in.
describe('POST /cafes/:cafeId/reservations accepts cafe-local date + time', () => {
  let cafe;
  let token;

  // Far enough out to clear the lead time from any run time of day.
  const bookingDate = () => {
    const d = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  };

  const book = (body) =>
    request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Cafe Local Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Cafe Local Input',
      slug: `cafe-local-input-${Date.now()}`,
      timezone: 'Asia/Kolkata',
      contact_phone: '+911234567890',
      address: { line1: '1 Test Street', city: 'Kochi', state: 'Kerala', postal_code: '682001' },
      subscription_status: 'active',
      reservation_rules: {
        default_turn_time_minutes: 60,
        max_party_size: 8,
        booking_lead_time_hours: 1,
        hold_duration_minutes: 10,
        payment_timeout_minutes: 15,
        reservation_fee: 100,
      },
      payments: {
        razorpay_key_id: 'rzp_test_fixture',
        razorpay_key_secret_encrypted: encrypt('fixture_key_secret'),
        razorpay_webhook_secret_encrypted: encrypt('fixture_webhook_secret'),
        configured: true,
      },
    });
    await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });

    const user = await User.create({
      name: 'Cafe Local Guest',
      email: `cafe-local-${Date.now()}@test.com`,
      phone: `+1555${String(Date.now()).slice(-7)}`,
      password_hash: 'pass',
      is_email_verified: true,
    });
    token = jwt.sign({ id: user._id, tv: 0 }, config.JWT_SECRET, { expiresIn: '1h' });
  });

  test('resolves the wall clock in the cafe timezone, not the server or client zone', async () => {
    const date = bookingDate();
    const res = await book({ date, time: '19:00', party_size: 2 });

    expect(res.status).toBe(201);

    const saved = await Reservation.findById(res.body.data.reservation_id);
    // 19:00 IST is 13:30 UTC on the same day.
    expect(saved.start_time.toISOString()).toBe(`${date}T13:30:00.000Z`);
  });

  test('a cafe in a different timezone resolves the same wall clock differently', async () => {
    await Cafe.updateOne({ _id: cafe._id }, { $set: { timezone: 'UTC' } });

    const date = bookingDate();
    const res = await book({ date, time: '19:00', party_size: 2 });

    expect(res.status).toBe(201);
    const saved = await Reservation.findById(res.body.data.reservation_id);
    expect(saved.start_time.toISOString()).toBe(`${date}T19:00:00.000Z`);
  });

  test.each([
    ['a rolled-over date', { date: '2026-02-30', time: '19:00' }, /real calendar date/i],
    ['an unpadded date', { date: '2026-9-5', time: '19:00' }, /real calendar date/i],
    ['a nonsense date', { date: 'not-a-date', time: '19:00' }, /real calendar date/i],
    ['an operator-injected date', { date: { $ne: null }, time: '19:00' }, /real calendar date/i],
    ['an out-of-range time', { date: '2027-01-05', time: '24:00' }, /HH:mm/i],
    ['an unpadded time', { date: '2027-01-05', time: '9:00' }, /HH:mm/i],
    ['a time with seconds', { date: '2027-01-05', time: '19:00:00' }, /HH:mm/i],
    ['an operator-injected time', { date: '2027-01-05', time: { $ne: null } }, /HH:mm/i],
  ])('rejects %s with 400', async (_label, payload, messagePattern) => {
    const res = await book({ ...payload, party_size: 2 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(messagePattern);
  });

  test('still accepts the deprecated pre-converted start_time during rollout', async () => {
    // The frontend and API deploy independently, so a client built before this
    // change must keep working until it is replaced.
    const date = bookingDate();
    const res = await book({ start_time: `${date}T13:30:00.000Z`, party_size: 2 });

    expect(res.status).toBe(201);
    const saved = await Reservation.findById(res.body.data.reservation_id);
    expect(saved.start_time.toISOString()).toBe(`${date}T13:30:00.000Z`);
  });

  test('cafe-local input wins when a client sends both shapes', async () => {
    const date = bookingDate();
    const res = await book({
      date,
      time: '19:00',
      // A stale/incorrect conversion of the same slot -- must be ignored.
      start_time: `${date}T19:00:00.000Z`,
      party_size: 2,
    });

    expect(res.status).toBe(201);
    const saved = await Reservation.findById(res.body.data.reservation_id);
    expect(saved.start_time.toISOString()).toBe(`${date}T13:30:00.000Z`);
  });

  test('requires party_size alongside the slot', async () => {
    const res = await book({ date: bookingDate(), time: '19:00' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/party_size/i);
  });
});
