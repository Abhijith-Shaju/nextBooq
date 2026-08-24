const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const { setupTestDB } = require('../setup');

setupTestDB();

// Regression test for a DoS amplification: durationMinutes was passed
// straight to generateSlotTimes()'s loop bound with no validation. A
// negative value inverted the loop's termination condition and produced
// hundreds of thousands of candidate slots — each one running two
// sequential DB queries via allocateTables() — from a single
// unauthenticated request.
describe('GET /available-slots rejects an out-of-range durationMinutes', () => {
  let cafe;
  let customerToken;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Duration Validation Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Duration Validation Cafe',
      slug: `duration-validation-cafe-${Date.now()}`,
      timezone: 'UTC',
      subscription_status: 'active',
    });
    await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });

    const customer = await User.create({
      name: 'Guest',
      email: `guest-duration-${Date.now()}@test.com`,
      phone: '+1555700099',
      password_hash: 'pass',
      is_email_verified: true,
    });
    customerToken = jwt.sign({ id: customer._id.toString() }, config.JWT_SECRET);
  });

  test('rejects a negative durationMinutes with 400 instead of generating hundreds of thousands of slots', async () => {
    const res = await request(app)
      .get(`/api/v1/cafes/${cafe._id}/available-slots`)
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ date: '2026-09-04', partySize: 2, durationMinutes: -9999999 });

    expect(res.status).toBe(400);
  });

  test('rejects a zero durationMinutes with 400', async () => {
    const res = await request(app)
      .get(`/api/v1/cafes/${cafe._id}/available-slots`)
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ date: '2026-09-04', partySize: 2, durationMinutes: 0 });

    expect(res.status).toBe(400);
  });

  test('rejects an absurdly large durationMinutes with 400', async () => {
    const res = await request(app)
      .get(`/api/v1/cafes/${cafe._id}/available-slots`)
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ date: '2026-09-04', partySize: 2, durationMinutes: 999999 });

    expect(res.status).toBe(400);
  });

  test('rejects a non-numeric durationMinutes with 400', async () => {
    const res = await request(app)
      .get(`/api/v1/cafes/${cafe._id}/available-slots`)
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ date: '2026-09-04', partySize: 2, durationMinutes: 'not-a-number' });

    expect(res.status).toBe(400);
  });

  test('still accepts a normal durationMinutes within range', async () => {
    const res = await request(app)
      .get(`/api/v1/cafes/${cafe._id}/available-slots`)
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ date: '2026-09-04', partySize: 2, durationMinutes: 90 });

    expect(res.status).toBe(200);
  });

  test('still accepts the request when durationMinutes is omitted (falls back to the cafe default)', async () => {
    const res = await request(app)
      .get(`/api/v1/cafes/${cafe._id}/available-slots`)
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ date: '2026-09-04', partySize: 2 });

    expect(res.status).toBe(200);
  });
});
