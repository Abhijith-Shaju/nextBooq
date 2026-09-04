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
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
  sendVerificationEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
}));

setupTestDB();

describe('Integration Test: reservation creation blocked for unverified email', () => {
  let cafe;
  let unverifiedToken;
  let verifiedToken;

  const futureStartTime = () => {
    const d = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    d.setUTCHours(19, 0, 0, 0);
    return d.toISOString();
  };

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Email Gate Test Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Email Gate Cafe',
      slug: 'email-gate-cafe',
      timezone: 'UTC',
      contact_phone: '+911234567890',
      address: { line1: '1 Test Street', city: 'Kochi', state: 'Kerala', postal_code: '682001' },
      payments: { razorpay_key_id: 'rzp_test_key', configured: true },
    });
    await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });

    const unverifiedUser = await User.create({
      name: 'Unverified Booker',
      email: 'unverified-booker@test.com',
      phone: '+1555800001',
      password_hash: 'pass',
      is_email_verified: false,
    });
    unverifiedToken = jwt.sign({ id: unverifiedUser._id.toString() }, config.JWT_SECRET);

    const verifiedUser = await User.create({
      name: 'Verified Booker',
      email: 'verified-booker@test.com',
      phone: '+1555800002',
      password_hash: 'pass',
      is_email_verified: true,
    });
    verifiedToken = jwt.sign({ id: verifiedUser._id.toString() }, config.JWT_SECRET);
  });

  test('rejects reservation creation for a user with unverified email (400)', async () => {
    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${unverifiedToken}`)
      .send({ start_time: futureStartTime(), party_size: 2 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/verify your email/i);

    const holds = await Reservation.find({ cafe_id: cafe._id });
    expect(holds).toHaveLength(0);
  });

  test('allows reservation creation for a verified user', async () => {
    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${verifiedToken}`)
      .send({ start_time: futureStartTime(), party_size: 2 });

    // The important assertion is that the email-verification gate did NOT fire.
    // In test env Razorpay is not configured so we accept 201, 400 (payment
    // validation), or 500 (Razorpay SDK error) — any of those mean the gate
    // itself did not block the request.
    expect([201, 400, 500]).toContain(res.status);
    if (res.status === 400 || res.status === 500) {
      expect(res.body.message ?? '').not.toMatch(/verify your email/i);
    }
  });
});
