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

jest.mock('../../src/services/emailService', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ logged: true }),
  sendVerificationEmail: jest.fn().mockResolvedValue({ logged: true }),
  sendStepUpOtpEmail: jest.fn().mockResolvedValue({ logged: true }),
  sendContactEmail: jest.fn().mockResolvedValue({ logged: true }),
  sendCafeApplicationReviewEmail: jest.fn().mockResolvedValue({ logged: true }),
  sendCafeApplicationApprovedEmail: jest.fn().mockResolvedValue({ logged: true }),
  sendCafeApplicationRejectedEmail: jest.fn().mockResolvedValue({ logged: true }),
  sendBookingConfirmationEmail: jest.fn().mockResolvedValue({ logged: true }),
}));

setupTestDB();

const HOURS = 60 * 60 * 1000;

describe('Guest cancels their own reservation', () => {
  let cafe;
  let guest;
  let token;
  let table;

  const makeBooking = async ({ hoursAway, status = 'CONFIRMED', paid = true, feePolicy }) => {
    const start = new Date(Date.now() + hoursAway * HOURS);
    return Reservation.create({
      cafe_id: cafe._id,
      user_id: guest._id,
      table_ids: [table._id],
      start_time: start,
      end_time: new Date(start.getTime() + 90 * 60 * 1000),
      party_size: 2,
      reservation_timezone: 'Asia/Kolkata',
      status,
      payment_data: paid
        ? { order_id: 'order_x', payment_id: 'pay_x', amount: 250, currency: 'INR' }
        : { order_id: 'order_x', amount: 250, currency: 'INR' },
      fee_policy: feePolicy ?? {
        adjusted_against_bill: true,
        refund_on_cancellation: true,
        cancellation_cutoff_hours: 24,
      },
    });
  };

  const cancel = (reservationId, asToken = token) =>
    request(app)
      .post(`/api/v1/customer/reservations/${reservationId}/cancel`)
      .set('Authorization', `Bearer ${asToken}`)
      .send({});

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Guest Cancel Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Guest Cancel Cafe',
      slug: 'guest-cancel-cafe',
      timezone: 'Asia/Kolkata',
    });
    guest = await User.create({
      name: 'Guest Canceller',
      email: 'guest-cancel@test.com',
      phone: '+15550500001',
      password_hash: 'pass',
      is_email_verified: true,
    });
    token = jwt.sign({ id: guest._id.toString() }, config.JWT_SECRET);
    table = await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 2 });
  });

  test('cancels a confirmed booking', async () => {
    const booking = await makeBooking({ hoursAway: 48 });

    const res = await cancel(booking._id);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
    expect((await Reservation.findById(booking._id)).status).toBe('CANCELLED');
  });

  describe('the cancellation cutoff decides the money, not the permission', () => {
    test('cancelling with enough notice puts a refund on the queue', async () => {
      const booking = await makeBooking({ hoursAway: 48 }); // cutoff is 24

      const res = await cancel(booking._id);

      expect(res.body.data.refund_due).toBe(true);
      const stored = await Reservation.findById(booking._id);
      expect(stored.payment_data.requires_manual_refund).toBe(true);
    });

    test('cancelling too late still cancels, but owes nothing', async () => {
      // The cutoff was snapshotted onto the booking and never read, so a cafe
      // asking for 24 hours' notice had refunds flagged for cancellations
      // minutes before the table -- against its own published terms.
      const booking = await makeBooking({ hoursAway: 2 }); // inside the 24h cutoff

      const res = await cancel(booking._id);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');
      expect(res.body.data.refund_due).toBe(false);

      const stored = await Reservation.findById(booking._id);
      expect(stored.status).toBe('CANCELLED');
      expect(Boolean(stored.payment_data.requires_manual_refund)).toBe(false);
    });

    test('a cafe with no cutoff still refunds a late cancellation', async () => {
      const booking = await makeBooking({
        hoursAway: 1,
        feePolicy: {
          adjusted_against_bill: true,
          refund_on_cancellation: true,
          cancellation_cutoff_hours: 0,
        },
      });

      const res = await cancel(booking._id);

      expect(res.body.data.refund_due).toBe(true);
    });

    test('non-refundable terms owe nothing however early the guest cancels', async () => {
      const booking = await makeBooking({
        hoursAway: 200,
        feePolicy: {
          adjusted_against_bill: false,
          refund_on_cancellation: false,
          cancellation_cutoff_hours: 24,
        },
      });

      const res = await cancel(booking._id);

      expect(res.body.data.refund_due).toBe(false);
    });

    test('an unpaid booking owes nothing', async () => {
      const booking = await makeBooking({ hoursAway: 48, paid: false });

      const res = await cancel(booking._id);

      expect(res.body.data.refund_due).toBe(false);
    });
  });

  describe('who may cancel what', () => {
    test('cannot cancel a booking belonging to someone else', async () => {
      const other = await User.create({
        name: 'Someone Else',
        email: 'other-cancel@test.com',
        phone: '+15550500002',
        password_hash: 'pass',
        is_email_verified: true,
      });
      const otherToken = jwt.sign({ id: other._id.toString() }, config.JWT_SECRET);
      const booking = await makeBooking({ hoursAway: 48 });

      const res = await cancel(booking._id, otherToken);

      // Not found rather than forbidden: the lookup is scoped by owner, so
      // another guest's booking never enters the picture to be refused.
      expect(res.status).toBe(404);
      expect((await Reservation.findById(booking._id)).status).toBe('CONFIRMED');
    });

    test('rejects an unauthenticated caller', async () => {
      const booking = await makeBooking({ hoursAway: 48 });

      const res = await request(app)
        .post(`/api/v1/customer/reservations/${booking._id}/cancel`)
        .send({});

      expect(res.status).toBe(401);
      expect((await Reservation.findById(booking._id)).status).toBe('CONFIRMED');
    });

    test('refuses once the guest has been seated', async () => {
      const booking = await makeBooking({ hoursAway: 1, status: 'SEATED' });

      const res = await cancel(booking._id);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/contact the cafe/i);
      expect((await Reservation.findById(booking._id)).status).toBe('SEATED');
    });

    test('refuses a booking already cancelled', async () => {
      const booking = await makeBooking({ hoursAway: 48, status: 'CANCELLED' });

      const res = await cancel(booking._id);

      expect(res.status).toBe(400);
    });
  });
});
