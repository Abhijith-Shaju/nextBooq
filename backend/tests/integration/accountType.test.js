const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const User = require('../../src/models/User');
const CafeApplication = require('../../src/models/CafeApplication');
const { setupTestDB } = require('../setup');

setupTestDB();

const makeUser = (overrides = {}) =>
  User.create({
    name: 'Account Type User',
    email: 'account-type@example.com',
    phone: '+15550140001',
    password_hash: 'x',
    is_email_verified: true,
    ...overrides,
  });

const bearer = (user) => jwt.sign({ id: user._id.toString(), tv: user.token_version }, config.JWT_SECRET);

describe('PATCH /api/v1/auth/account-type', () => {
  test('rejects an unauthenticated caller', async () => {
    const res = await request(app).patch('/api/v1/auth/account-type').send({ account_type: 'cafe_owner' });
    expect(res.status).toBe(401);
  });

  test('records a valid account type and returns it on the user payload', async () => {
    const user = await makeUser();
    const res = await request(app)
      .patch('/api/v1/auth/account-type')
      .set('Authorization', `Bearer ${bearer(user)}`)
      .send({ account_type: 'cafe_owner' });

    expect(res.status).toBe(200);
    expect(res.body.data.account_type).toBe('cafe_owner');
    expect(await User.findById(user._id)).toMatchObject({ account_type: 'cafe_owner' });
  });

  test('rejects an unknown account type', async () => {
    const user = await makeUser({ email: 'bad-type@example.com', phone: '+15550140002' });
    const res = await request(app)
      .patch('/api/v1/auth/account-type')
      .set('Authorization', `Bearer ${bearer(user)}`)
      .send({ account_type: 'platform_admin' });

    expect(res.status).toBe(400);
    expect(await User.findById(user._id)).toMatchObject({ account_type: null });
  });

  test('setting account_type grants no privilege', async () => {
    const user = await makeUser({ email: 'no-privilege@example.com', phone: '+15550140003' });
    await request(app)
      .patch('/api/v1/auth/account-type')
      .set('Authorization', `Bearer ${bearer(user)}`)
      .send({ account_type: 'cafe_owner' });

    const [me, admin, org] = await Promise.all([
      request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${bearer(user)}`),
      request(app).get('/api/v1/platform-admin/overview').set('Authorization', `Bearer ${bearer(user)}`),
      request(app).get('/api/v1/org').set('Authorization', `Bearer ${bearer(user)}`),
    ]);

    expect(me.body.data.owner_org_id).toBeNull();
    expect(me.body.data.is_platform_admin).toBe(false);
    expect(admin.status).toBe(403);
    expect(org.status).toBe(403);
  });
});

describe('GET /api/v1/auth/me cafe_application', () => {
  test('is null when the user has never applied', async () => {
    const user = await makeUser({ email: 'never-applied@example.com', phone: '+15550140004' });
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${bearer(user)}`);
    expect(res.body.data.cafe_application).toBeNull();
  });

  test('summarises the latest application', async () => {
    const user = await makeUser({ email: 'has-applied@example.com', phone: '+15550140005' });
    await CafeApplication.create({
      application_ref: 'NB-7K2M-9QRT',
      applicant_user_id: user._id,
      organization_name: 'Filter Kaapi Co',
      cafe_name: 'Filter Kaapi',
      cafe_slug: 'filter-kaapi',
      timezone: 'Asia/Kolkata',
      address: { line1: '12 Church Street', city: 'Bengaluru', state: 'Karnataka', postal_code: '560001' },
    });

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${bearer(user)}`);
    expect(res.body.data.cafe_application).toMatchObject({
      application_ref: 'NB-7K2M-9QRT',
      status: 'pending',
      cafe_slug: 'filter-kaapi',
    });
  });
});
