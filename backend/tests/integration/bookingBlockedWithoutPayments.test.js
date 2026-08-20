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

describe('Integration Test: booking is blocked for a cafe without payments configured', () => {
  let cafe;
  let token;

  const futureStartTime = () => {
    const d = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    d.setUTCHours(19, 0, 0, 0);
    return d.toISOString();
  };

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Unconfigured Payments Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Unconfigured Payments Cafe',
      slug: 'unconfigured-payments-cafe',
      timezone: 'UTC',
    });
    await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });
    const user = await User.create({
      name: 'Blocked Booker',
      email: 'blocked-booker@test.com',
      phone: '+1555900003',
      password_hash: 'pass',
      is_email_verified: true,
    });
    token = jwt.sign({ id: user._id.toString() }, config.JWT_SECRET);
  });

  test('rejects hold creation in production when payments are not configured', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await request(app)
        .post(`/api/v1/cafes/${cafe._id}/reservations`)
        .set('Authorization', `Bearer ${token}`)
        .send({ start_time: futureStartTime(), party_size: 2 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/payments/i);

      const holds = await Reservation.find({ cafe_id: cafe._id });
      expect(holds).toHaveLength(0);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
