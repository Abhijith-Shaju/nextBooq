const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Organization = require('../../src/models/Organization');
const Cafe = require('../../src/models/Cafe');
const User = require('../../src/models/User');
const Subscription = require('../../src/models/Subscription');
const { setupTestDB } = require('../setup');
const { encrypt } = require('../../src/utils/encryption');

setupTestDB();

describe('Platform admin routes', () => {
  let adminToken, cafeStaffToken, org, cafe;

  beforeEach(async () => {
    org = await Organization.create({ name: 'Route Test Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Route Test Cafe',
      slug: 'route-test-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });

    const admin = await User.create({
      name: 'Platform Admin',
      email: 'platform-admin@test.com',
      phone: '+1555993001',
      password_hash: 'pass',
      is_platform_admin: true,
    });
    adminToken = jwt.sign({ id: admin._id.toString() }, config.JWT_SECRET);

    const cafeStaff = await User.create({
      name: 'Cafe Owner',
      email: 'cafe-owner-route@test.com',
      phone: '+1555993002',
      password_hash: 'pass',
      staff_memberships: [{ cafe_id: cafe._id, role: 'owner', permissions: [] }],
    });
    cafeStaffToken = jwt.sign({ id: cafeStaff._id.toString() }, config.JWT_SECRET);
  });

  test('a cafe-staff (non-platform-admin) user gets 403 on every platform-admin route', async () => {
    const overview = await request(app)
      .get('/api/v1/platform-admin/overview')
      .set('Authorization', `Bearer ${cafeStaffToken}`);
    expect(overview.status).toBe(403);

    const orgs = await request(app)
      .get('/api/v1/platform-admin/orgs')
      .set('Authorization', `Bearer ${cafeStaffToken}`);
    expect(orgs.status).toBe(403);
  });

  test('an unauthenticated request gets 401', async () => {
    const res = await request(app).get('/api/v1/platform-admin/overview');
    expect(res.status).toBe(401);
  });

  test('GET /overview returns computed stats for a platform admin', async () => {
    const res = await request(app)
      .get('/api/v1/platform-admin/overview')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('org_count');
    expect(res.body.data).toHaveProperty('revenue');
  });

  test('GET /orgs lists every org with its cafes', async () => {
    const res = await request(app)
      .get('/api/v1/platform-admin/orgs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const found = res.body.data.find((o) => o._id === org._id.toString());
    expect(found).toBeDefined();
    expect(found.cafes[0].subscription).toBeNull();
  });

  test('GET /orgs never leaks a cafe\'s encrypted Razorpay secrets', async () => {
    await Cafe.updateOne(
      { _id: cafe._id },
      {
        $set: {
          payments: {
            razorpay_key_id: 'rzp_test_leaktest',
            razorpay_key_secret_encrypted: encrypt('super_secret_key'),
            razorpay_webhook_secret_encrypted: encrypt('super_secret_webhook'),
            configured: true,
          },
        },
      }
    );

    const res = await request(app)
      .get('/api/v1/platform-admin/orgs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const found = res.body.data.find((o) => o._id === org._id.toString());
    const foundCafe = found.cafes.find((c) => c._id === cafe._id.toString());
    expect(foundCafe).toBeDefined();
    expect(foundCafe.payments.razorpay_key_id).toBe('rzp_test_leaktest');
    expect(foundCafe.payments.configured).toBe(true);
    expect(foundCafe.payments).not.toHaveProperty('razorpay_key_secret_encrypted');
    expect(foundCafe.payments).not.toHaveProperty('razorpay_webhook_secret_encrypted');

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/razorpay_key_secret_encrypted/);
    expect(serialized).not.toMatch(/razorpay_webhook_secret_encrypted/);
  });

  test('POST /cafes/:cafeId/subscriptions records a term and returns it', async () => {
    const res = await request(app)
      .post(`/api/v1/platform-admin/cafes/${cafe._id}/subscriptions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ org_id: org._id.toString(), term_months: 12, price_per_month: 7000, note: 'Paid via UPI' });

    expect(res.status).toBe(201);
    expect(res.body.data.term_months).toBe(12);
    expect(res.body.data.is_current).toBe(true);
  });

  test('POST /cafes/:cafeId/subscriptions rejects an invalid term_months', async () => {
    const res = await request(app)
      .post(`/api/v1/platform-admin/cafes/${cafe._id}/subscriptions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ org_id: org._id.toString(), term_months: 3, price_per_month: 7000 });

    expect(res.status).toBe(400);
  });

  test.each([
    ['term null', 'term_months', null],
    ['term string', 'term_months', '12'],
    ['term boolean', 'term_months', false],
    ['term empty string', 'term_months', ''],
    ['price null', 'price_per_month', null],
    ['price string', 'price_per_month', '7000'],
    ['price boolean', 'price_per_month', false],
    ['price empty string', 'price_per_month', ''],
  ])('POST /cafes/:cafeId/subscriptions rejects non-numeric JSON %s', async (_label, field, invalidValue) => {
    const res = await request(app)
      .post(`/api/v1/platform-admin/cafes/${cafe._id}/subscriptions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        org_id: org._id.toString(),
        term_months: field === 'term_months' ? invalidValue : 12,
        price_per_month: field === 'price_per_month' ? invalidValue : 7000,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(`${field} must be a JSON number`);
    expect(await Subscription.countDocuments({ cafe_id: cafe._id })).toBe(0);
  });

  test('GET /cafes/:cafeId/subscriptions returns history newest-first', async () => {
    await Subscription.create({
      org_id: org._id,
      cafe_id: cafe._id,
      term_months: 1,
      price_per_month: 9000,
      period_start: new Date('2026-01-01T00:00:00Z'),
      current_period_end: new Date('2026-02-01T00:00:00Z'),
      status: 'inactive',
      is_current: false,
    });
    await Subscription.create({
      org_id: org._id,
      cafe_id: cafe._id,
      term_months: 12,
      price_per_month: 7000,
      period_start: new Date('2026-03-01T00:00:00Z'),
      current_period_end: new Date('2027-03-01T00:00:00Z'),
      status: 'active',
      is_current: true,
    });

    const res = await request(app)
      .get(`/api/v1/platform-admin/cafes/${cafe._id}/subscriptions`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].term_months).toBe(12);
  });

  test('PATCH /cafes/:cafeId/subscriptions/status updates status for a configured cafe', async () => {
    await request(app)
      .post(`/api/v1/platform-admin/cafes/${cafe._id}/subscriptions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ org_id: org._id.toString(), term_months: 1, price_per_month: 9000 });

    const res = await request(app)
      .patch(`/api/v1/platform-admin/cafes/${cafe._id}/subscriptions/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'inactive' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('inactive');
  });

  test('PATCH /cafes/:cafeId/subscriptions/status 404s for an unconfigured cafe', async () => {
    const res = await request(app)
      .patch(`/api/v1/platform-admin/cafes/${cafe._id}/subscriptions/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'inactive' });

    expect(res.status).toBe(404);
  });

  test('PATCH /cafes/:cafeId/subscriptions/status rejects an invalid status value', async () => {
    const res = await request(app)
      .patch(`/api/v1/platform-admin/cafes/${cafe._id}/subscriptions/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/auth/me includes is_platform_admin', () => {
  test('true for a platform admin', async () => {
    const admin = await User.create({
      name: 'Me Admin',
      email: 'me-admin@test.com',
      phone: '+1555993003',
      password_hash: 'pass',
      is_platform_admin: true,
    });
    const token = jwt.sign({ id: admin._id.toString() }, config.JWT_SECRET);

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.is_platform_admin).toBe(true);
  });

  test('false for a regular user', async () => {
    const user = await User.create({
      name: 'Me Regular',
      email: 'me-regular@test.com',
      phone: '+1555993004',
      password_hash: 'pass',
    });
    const token = jwt.sign({ id: user._id.toString() }, config.JWT_SECRET);

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.is_platform_admin).toBe(false);
  });
});
