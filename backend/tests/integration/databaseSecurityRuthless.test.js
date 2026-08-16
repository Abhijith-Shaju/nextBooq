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
const sanitizeInput = require('../../src/middleware/sanitizeInput');

setupTestDB();

describe('Database security audit: NoSQL injection', () => {
  test('sanitizeInput middleware strips $-operator and dotted keys from nested objects/arrays', () => {
    const req = {
      body: {
        phone: { $ne: null },
        nested: { safe: 'ok', $where: '1==1', 'a.b': 'dotted' },
        list: [{ $gt: '' }, { safe: 'yes' }],
      },
      query: { email: { $regex: '.*' } },
      params: {},
    };
    const next = jest.fn();

    sanitizeInput(req, {}, next);

    expect(req.body.phone).toEqual({});
    expect(req.body.nested).toEqual({ safe: 'ok' });
    expect(req.body.list).toEqual([{}, { safe: 'yes' }]);
    expect(req.query.email).toEqual({});
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('FIXED: registering with phone as a Mongo operator object is rejected, not used as a query filter', async () => {
    // Seed an existing user so a naive `User.findOne({ phone })` with an unsanitized
    // `{ $ne: null }` payload would have matched them and returned a false
    // "already exists" (or, on an empty collection, would have inserted a
    // non-string phone value straight into the DB).
    await User.create({
      name: 'Existing User',
      email: 'existing@test.com',
      phone: '+15550001111',
      password_hash: 'hash',
    });

    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Attacker',
      email: 'attacker@test.com',
      phone: { $ne: null },
      password: 'Password123!',
    });

    expect(res.status).toBe(400);
    const created = await User.findOne({ email: 'attacker@test.com' });
    expect(created).toBeNull();
  });

  test('FIXED: registering with phone as a $where/regex object is rejected', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Attacker',
      email: 'attacker2@test.com',
      phone: { $regex: '.*' },
      password: 'Password123!',
    });

    expect(res.status).toBe(400);
  });

  test('FIXED: logging in with email/password as Mongo operator objects is rejected, not evaluated as a query', async () => {
    await User.create({
      name: 'Victim',
      email: 'victim@test.com',
      phone: '+15550002222',
      password_hash: 'somehash',
    });

    const res = await request(app).post('/api/v1/auth/login').send({
      email: { $gt: '' },
      password: { $gt: '' },
    });

    expect(res.status).toBe(400);
  });

  test('FIXED: customer-quick-auth with phone as an operator object is rejected', async () => {
    const res = await request(app).post('/api/v1/auth/customer-quick-auth').send({
      name: 'Attacker',
      email: 'quickauth-attacker@test.com',
      phone: { $ne: null },
      password: 'Password123!',
    });

    expect(res.status).toBe(400);
  });

  test('sanity: registration with well-formed string fields still succeeds after sanitization', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Legit User',
      email: 'legit@test.com',
      phone: '+15550003333',
      password: 'Password123!',
    });

    expect(res.status).toBe(201);
  });
});

describe('Database security audit: sensitive field exposure', () => {
  test('password_hash never appears in register/login/quick-auth/getMe JSON responses', async () => {
    const registerRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Expose Test',
      email: 'expose@test.com',
      phone: '+15550004444',
      password: 'Password123!',
    });
    expect(registerRes.status).toBe(201);
    expect(JSON.stringify(registerRes.body)).not.toMatch(/password_hash/i);
    expect(registerRes.body.data.user.password).toBeUndefined();

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'expose@test.com',
      password: 'Password123!',
    });
    expect(loginRes.status).toBe(200);
    expect(JSON.stringify(loginRes.body)).not.toMatch(/password_hash/i);

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.data.token}`);
    expect(meRes.status).toBe(200);
    expect(JSON.stringify(meRes.body)).not.toMatch(/password_hash/i);

    const quickAuthRes = await request(app).post('/api/v1/auth/customer-quick-auth').send({
      name: 'Quick Auth Expose',
      email: 'quickexpose@test.com',
      phone: '+15550005555',
      password: 'Password123!',
    });
    expect(quickAuthRes.status).toBe(200);
    expect(JSON.stringify(quickAuthRes.body)).not.toMatch(/password_hash/i);
  });
});

describe('Database security audit: cross-tenant data isolation', () => {
  let cafeA, cafeB, hostAToken, tableB, reservationB;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Isolation Test Org' });
    cafeA = await Cafe.create({
      org_id: org._id,
      name: 'Cafe A',
      slug: `cafe-a-${Date.now()}`,
      timezone: 'UTC',
      subscription_status: 'active',
    });
    cafeB = await Cafe.create({
      org_id: org._id,
      name: 'Cafe B',
      slug: `cafe-b-${Date.now()}`,
      timezone: 'UTC',
      subscription_status: 'active',
    });

    const hostAUser = await User.create({
      name: 'Host A',
      email: `hosta-${Date.now()}@test.com`,
      phone: '+15550006666',
      password_hash: 'hash',
      staff_memberships: [
        { cafe_id: cafeA._id, role: 'host', permissions: ['view_reservations', 'edit_reservations'] },
      ],
    });
    hostAToken = jwt.sign({ id: hostAUser._id.toString() }, config.JWT_SECRET);

    const customerB = await User.create({
      name: 'Customer B',
      email: `customerb-${Date.now()}@test.com`,
      phone: '+15550007777',
      password_hash: 'hash',
    });

    tableB = await Table.create({ cafe_id: cafeB._id, table_number: 'B1', capacity: 4 });
    reservationB = await Reservation.create({
      cafe_id: cafeB._id,
      user_id: customerB._id,
      table_ids: [tableB._id],
      start_time: new Date('2026-08-20T12:00:00Z'),
      end_time: new Date('2026-08-20T13:00:00Z'),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'CONFIRMED',
    });
  });

  test('a host with no membership at Cafe B gets 403 fetching Cafe B daily manifest', async () => {
    const res = await request(app)
      .get(`/api/v1/cafes/${cafeB._id}/reservations`)
      .set('Authorization', `Bearer ${hostAToken}`);

    expect(res.status).toBe(403);
  });

  test('a host with no membership at Cafe B gets 403 updating a Cafe B reservation status', async () => {
    const res = await request(app)
      .put(`/api/v1/cafes/${cafeB._id}/reservations/${reservationB._id}/status`)
      .set('Authorization', `Bearer ${hostAToken}`)
      .send({ status: 'CHECKED_IN', version: reservationB.__v });

    expect(res.status).toBe(403);
    const dbRes = await Reservation.findById(reservationB._id);
    expect(dbRes.status).toBe('CONFIRMED'); // untouched
  });

  test('Cafe B reservation ID cannot be mutated by addressing it under Cafe A tenant scope', async () => {
    // hostA has edit_reservations at cafeA; try to reach cafeB's reservation via cafeA's URL scope.
    const res = await request(app)
      .put(`/api/v1/cafes/${cafeA._id}/reservations/${reservationB._id}/status`)
      .set('Authorization', `Bearer ${hostAToken}`)
      .send({ status: 'CHECKED_IN', version: reservationB.__v });

    // transitionState filters by { _id: resId, cafe_id: tenantId(cafeA) }, so a
    // reservation belonging to cafeB must not be found/mutated under cafeA's scope.
    expect(res.status).toBe(404);
    const dbRes = await Reservation.findById(reservationB._id);
    expect(dbRes.status).toBe('CONFIRMED');
  });

  test('the X-Tenant-Id header cannot be used to bypass RBAC on a URL that already specifies :cafeId', async () => {
    const res = await request(app)
      .get(`/api/v1/cafes/${cafeB._id}/reservations`)
      .set('Authorization', `Bearer ${hostAToken}`)
      .set('X-Tenant-Id', cafeA._id.toString()); // header points at a cafe hostA DOES have access to

    // req.params.cafeId (cafeB) takes precedence over the header, so this must still 403.
    expect(res.status).toBe(403);
  });
});

describe('Database security audit: production secret hygiene', () => {
  test('FIXED: production env config rejects the published-default RAZORPAY_WEBHOOK_SECRET', () => {
    const result = config.envSchema.safeParse({
      NODE_ENV: 'production',
      MONGO_URI: 'mongodb://prod-host:27017/nextbooq',
      JWT_SECRET: 'a'.repeat(32),
      RAZORPAY_KEY_ID: 'rzp_live_real_key',
      RAZORPAY_KEY_SECRET: 'rzp_live_real_secret',
      // RAZORPAY_WEBHOOK_SECRET intentionally omitted -> falls back to the insecure default
    });

    expect(result.success).toBe(false);
  });

  test('FIXED: production env config rejects the published-default RAZORPAY_KEY_ID/SECRET', () => {
    const result = config.envSchema.safeParse({
      NODE_ENV: 'production',
      MONGO_URI: 'mongodb://prod-host:27017/nextbooq',
      JWT_SECRET: 'a'.repeat(32),
      RAZORPAY_WEBHOOK_SECRET: 'a_real_webhook_secret',
      // RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET intentionally omitted
    });

    expect(result.success).toBe(false);
  });

  test('sanity: production env config accepts fully-overridden real secrets', () => {
    const result = config.envSchema.safeParse({
      NODE_ENV: 'production',
      MONGO_URI: 'mongodb://prod-host:27017/nextbooq',
      JWT_SECRET: 'a'.repeat(32),
      RAZORPAY_KEY_ID: 'rzp_live_real_key',
      RAZORPAY_KEY_SECRET: 'rzp_live_real_secret',
      RAZORPAY_WEBHOOK_SECRET: 'a_real_webhook_secret',
      RESEND_API_KEY: 're_real_key',
      FROM_EMAIL: 'nextBooq <noreply@realdomain.com>',
    });

    expect(result.success).toBe(true);
  });

  test('sanity: development/test env config still allows the published defaults (local dev convenience)', () => {
    const result = config.envSchema.safeParse({
      NODE_ENV: 'development',
      MONGO_URI: 'mongodb://localhost:27017/nextbooq',
      JWT_SECRET: 'a'.repeat(32),
    });

    expect(result.success).toBe(true);
  });
});
