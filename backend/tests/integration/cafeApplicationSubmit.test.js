const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const User = require('../../src/models/User');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const CafeApplication = require('../../src/models/CafeApplication');
const { APPLICATION_REF_PATTERN } = require('../../src/utils/applicationRef');
const { setupTestDB } = require('../setup');

setupTestDB();

const makeUser = (overrides = {}) =>
  User.create({
    name: 'Applicant',
    email: `applicant-${Math.random().toString(36).slice(2)}@example.com`,
    phone: `+1555015${Math.floor(1000 + Math.random() * 8999)}`,
    password_hash: 'x',
    is_email_verified: true,
    ...overrides,
  });

const bearer = (user) => jwt.sign({ id: user._id.toString(), tv: user.token_version }, config.JWT_SECRET);

const body = (overrides = {}) => ({
  organization_name: 'Filter Kaapi Co',
  cafe_name: 'Filter Kaapi',
  cafe_slug: 'filter-kaapi',
  timezone: 'Asia/Kolkata',
  address: {
    line1: '12 Church Street',
    city: 'Bengaluru',
    state: 'Karnataka',
    postal_code: '560001',
    map_url: 'https://maps.google.com/?q=filter+kaapi',
  },
  ...overrides,
});

const submit = (user, payload = body()) =>
  request(app).post('/api/v1/cafe-applications').set('Authorization', `Bearer ${bearer(user)}`).send(payload);

describe('POST /api/v1/cafe-applications', () => {
  test('rejects an unauthenticated caller', async () => {
    const res = await request(app).post('/api/v1/cafe-applications').send(body());
    expect(res.status).toBe(401);
    expect(await CafeApplication.countDocuments()).toBe(0);
  });

  test('rejects an unverified email', async () => {
    const user = await makeUser({ is_email_verified: false });
    const res = await submit(user);
    expect(res.status).toBe(403);
    expect(await CafeApplication.countDocuments()).toBe(0);
  });

  test('creates a pending application with a reference', async () => {
    const user = await makeUser();
    const res = await submit(user);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.application_ref).toMatch(APPLICATION_REF_PATTERN);

    const stored = await CafeApplication.findOne({ applicant_user_id: user._id });
    expect(stored.cafe_slug).toBe('filter-kaapi');
    expect(stored.address.city).toBe('Bengaluru');
    expect(stored.address.country).toBe('India');
  });

  test('rejects a second pending application', async () => {
    const user = await makeUser();
    await submit(user);
    const res = await submit(user, body({ cafe_slug: 'second-cafe' }));

    expect(res.status).toBe(409);
    expect(await CafeApplication.countDocuments({ applicant_user_id: user._id })).toBe(1);
  });

  test('rejects a slug that an existing cafe already holds', async () => {
    const org = await Organization.create({ name: 'Existing Organization' });
    await Cafe.create({ org_id: org._id, name: 'Existing', slug: 'filter-kaapi', timezone: 'UTC' });

    const user = await makeUser();
    const res = await submit(user);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/already/i);
  });

  test('rejects a slug another pending application already requested', async () => {
    const first = await makeUser();
    await submit(first);

    const second = await makeUser();
    const res = await submit(second);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/already/i);
  });

  test('rejects a reserved slug', async () => {
    const user = await makeUser();
    const res = await submit(user, body({ cafe_slug: 'profile' }));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/reserved/);
  });

  test('rejects an invalid PIN', async () => {
    const user = await makeUser();
    const res = await submit(user, body({ address: { ...body().address, postal_code: '060001' } }));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/6-digit/);
  });
});

describe('GET and DELETE /api/v1/cafe-applications/mine', () => {
  test('returns null when the user has never applied', async () => {
    const user = await makeUser();
    const res = await request(app)
      .get('/api/v1/cafe-applications/mine')
      .set('Authorization', `Bearer ${bearer(user)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  test('returns only the caller own application', async () => {
    const mine = await makeUser();
    const theirs = await makeUser();
    await submit(mine);
    await submit(theirs, body({ cafe_slug: 'their-cafe' }));

    const res = await request(app)
      .get('/api/v1/cafe-applications/mine')
      .set('Authorization', `Bearer ${bearer(theirs)}`);
    expect(res.body.data.cafe_slug).toBe('their-cafe');
  });

  test('withdraws a pending application and frees the slug', async () => {
    const user = await makeUser();
    await submit(user);

    const withdraw = await request(app)
      .delete('/api/v1/cafe-applications/mine')
      .set('Authorization', `Bearer ${bearer(user)}`);
    expect(withdraw.status).toBe(200);
    expect(withdraw.body.data.status).toBe('withdrawn');

    const again = await submit(user);
    expect(again.status).toBe(201);
  });

  test('returns 404 when there is no pending application to withdraw', async () => {
    const user = await makeUser();
    const res = await request(app)
      .delete('/api/v1/cafe-applications/mine')
      .set('Authorization', `Bearer ${bearer(user)}`);
    expect(res.status).toBe(404);
  });
});
