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

jest.mock('../../src/services/emailService', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
  sendVerificationEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
  sendStepUpOtpEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
  sendContactEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
  sendCafeApplicationReviewEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
  sendCafeApplicationApprovedEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
  sendCafeApplicationRejectedEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
  sendBookingConfirmationEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
}));
const { sendBookingConfirmationEmail } = require('../../src/services/emailService');

setupTestDB();

// The email is deliberately not awaited by the transition that triggers it, so
// the HTTP response can return before it has been sent. Poll briefly rather
// than assert immediately.
const waitForEmail = async (attempts = 20) => {
  for (let i = 0; i < attempts; i += 1) {
    if (sendBookingConfirmationEmail.mock.calls.length > 0) return true;
    await new Promise((resolve) => setImmediate(resolve));
  }
  return sendBookingConfirmationEmail.mock.calls.length > 0;
};

describe('Booking confirmation email', () => {
  let cafe;
  let user;
  let token;
  let reservation;
  const orderId = 'order_confirm_email_1';
  const paymentId = 'pay_confirm_email_1';

  const signCheckoutResponse = (razorpayOrderId, razorpayPaymentId) =>
    crypto
      .createHmac('sha256', 'fixture_key_secret')
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

  const confirmBooking = () =>
    request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/verify-payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signCheckoutResponse(orderId, paymentId),
      });

  beforeEach(async () => {
    sendBookingConfirmationEmail.mockClear();
    sendBookingConfirmationEmail.mockResolvedValue({ logged: true, data: null, error: null });

    const org = await Organization.create({ name: 'Confirmation Email Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Confirmation Cafe',
      slug: 'confirmation-cafe',
      // Deliberately not UTC, so the assertions below can tell a converted
      // time from an unconverted one.
      timezone: 'Asia/Kolkata',
      payments: {
        razorpay_key_id: 'rzp_test_fixture',
        razorpay_key_secret_encrypted: encrypt('fixture_key_secret'),
        razorpay_webhook_secret_encrypted: encrypt('fixture_webhook_secret'),
        configured: true,
      },
    });

    user = await User.create({
      name: 'Priya Sharma',
      email: 'priya-confirm@test.com',
      phone: '+15550400001',
      password_hash: 'pass',
      is_email_verified: true,
    });
    token = jwt.sign({ id: user._id.toString() }, config.JWT_SECRET);

    const table = await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 2 });

    reservation = await Reservation.create({
      cafe_id: cafe._id,
      user_id: user._id,
      table_ids: [table._id],
      // 13:30 UTC is 7:00 PM in Asia/Kolkata, on the same date.
      start_time: new Date('2026-08-20T13:30:00Z'),
      end_time: new Date('2026-08-20T15:00:00Z'),
      party_size: 4,
      reservation_timezone: 'Asia/Kolkata',
      status: 'PENDING_PAYMENT',
      payment_data: { order_id: orderId, amount: 250, currency: 'INR', webhook_processed: false },
    });
  });

  test('emails the guest when their booking is confirmed', async () => {
    const res = await confirmBooking();
    expect(res.status).toBe(200);

    expect(await waitForEmail()).toBe(true);

    const payload = sendBookingConfirmationEmail.mock.calls[0][0];
    expect(payload.to).toBe('priya-confirm@test.com');
    expect(payload.guestName).toBe('Priya Sharma');
    expect(payload.cafeName).toBe('Confirmation Cafe');
    expect(payload.cafeSlug).toBe('confirmation-cafe');
    expect(payload.partySize).toBe(4);
    expect(payload.amount).toBe(250);
  });

  test('states the time in the cafe timezone, not UTC', async () => {
    // A guest told the UTC hour would arrive five and a half hours early and
    // find their table given away. This is the assertion that matters most.
    await confirmBooking();
    expect(await waitForEmail()).toBe(true);

    const { when } = sendBookingConfirmationEmail.mock.calls[0][0];

    expect(when).toContain('20 August 2026');
    expect(when).toMatch(/7:00/);
    expect(when).not.toMatch(/1:30/); // the UTC time, if nothing converted it
  });

  test('does not email on transitions that are not a confirmation', async () => {
    await Reservation.updateOne({ _id: reservation._id }, { $set: { status: 'CONFIRMED' } });
    sendBookingConfirmationEmail.mockClear();

    const res = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CANCELLED' });

    // Whether this caller is allowed to cancel is another test's business; what
    // matters here is that no confirmation email went out either way.
    expect([200, 401, 403, 404, 409, 422]).toContain(res.status);
    await waitForEmail(5);
    expect(sendBookingConfirmationEmail).not.toHaveBeenCalled();
  });

  test('a failing email does not fail the booking', async () => {
    // The guest has already been charged by this point. An email provider
    // being down must never turn a paid, committed reservation into a failed
    // request.
    sendBookingConfirmationEmail.mockRejectedValue(new Error('Resend is down'));

    const res = await confirmBooking();

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CONFIRMED');

    const stored = await Reservation.findById(reservation._id);
    expect(stored.status).toBe('CONFIRMED');
  });
});
