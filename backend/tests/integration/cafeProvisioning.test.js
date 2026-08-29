const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Organization = require('../../src/models/Organization');
const Cafe = require('../../src/models/Cafe');
const User = require('../../src/models/User');
const Subscription = require('../../src/models/Subscription');
const AuditLog = require('../../src/models/AuditLog');
const { provisionCafe } = require('../../src/services/cafeProvisioningService');
const { setupTestDB } = require('../setup');

setupTestDB();

const makeUser = async ({
  name = 'Prospective Owner',
  email = 'prospective-owner@example.com',
  phone = '+15550110001',
  is_platform_admin = false,
  staff_memberships = [],
} = {}) => User.create({ name, email, phone, password_hash: 'not-used-in-this-test', is_platform_admin, staff_memberships });

const bearer = (user) => jwt.sign({ id: user._id.toString() }, config.JWT_SECRET);

const address = () => ({
  line1: '12 Church Street',
  city: 'Bengaluru',
  state: 'Karnataka',
  postal_code: '560001',
});

const payloadFor = (ownerUserId, overrides = {}) => ({
  owner_user_id: ownerUserId.toString(),
  organization: { mode: 'new', name: 'Provisioning Organization' },
  cafe: {
    name: 'Provisioning Cafe',
    slug: 'provisioning-cafe',
    timezone: 'Asia/Kolkata',
    address: address(),
  },
  subscription: { status: 'active', term_months: 12, price_per_month: 7000, note: 'Paid by admin' },
  ...overrides,
});

const counts = async () => ({
  organizations: await Organization.countDocuments(),
  cafes: await Cafe.countDocuments(),
  subscriptions: await Subscription.countDocuments(),
});

describe('platform-admin transactional cafe provisioning', () => {
  test('rejects unauthenticated provisioning and owner lookup', async () => {
    const owner = await makeUser();

    const [lookup, provision] = await Promise.all([
      request(app).get(`/api/v1/platform-admin/users/lookup?email=${owner.email}`),
      request(app).post('/api/v1/platform-admin/cafes').send(payloadFor(owner._id)),
    ]);

    expect(lookup.status).toBe(401);
    expect(provision.status).toBe(401);
    expect(await counts()).toEqual({ organizations: 0, cafes: 0, subscriptions: 0 });
  });

  test('rejects a normal authenticated user from provisioning and owner lookup', async () => {
    const normal = await makeUser({ email: 'normal@example.com', phone: '+15550110002' });
    const owner = await makeUser({ email: 'owner@example.com', phone: '+15550110003' });

    const [lookup, provision] = await Promise.all([
      request(app).get(`/api/v1/platform-admin/users/lookup?email=${owner.email}`).set('Authorization', `Bearer ${bearer(normal)}`),
      request(app).post('/api/v1/platform-admin/cafes').set('Authorization', `Bearer ${bearer(normal)}`).send(payloadFor(owner._id)),
    ]);

    expect(lookup.status).toBe(403);
    expect(provision.status).toBe(403);
    expect(await counts()).toEqual({ organizations: 0, cafes: 0, subscriptions: 0 });
  });

  test('looks up an owner case-insensitively and returns only owner-controlled organizations', async () => {
    const admin = await makeUser({ name: 'Admin', email: 'admin@example.com', phone: '+15550110004', is_platform_admin: true });
    const owner = await makeUser({ email: 'lookup-owner@example.com', phone: '+15550110005' });
    const org = await Organization.create({ name: 'Owned Organization' });
    const ownedCafe = await Cafe.create({ org_id: org._id, name: 'Owned Cafe', slug: 'owned-lookup-cafe', timezone: 'UTC' });
    const nonOwnedOrg = await Organization.create({ name: 'Staff Organization' });
    const staffedCafe = await Cafe.create({ org_id: nonOwnedOrg._id, name: 'Staff Cafe', slug: 'staff-lookup-cafe', timezone: 'UTC' });
    owner.staff_memberships.push(
      { cafe_id: ownedCafe._id, role: 'owner', permissions: [] },
      { cafe_id: staffedCafe._id, role: 'manager', permissions: [] }
    );
    await owner.save();

    const res = await request(app)
      .get('/api/v1/platform-admin/users/lookup?email=%20LOOKUP-OWNER%40EXAMPLE.COM%20')
      .set('Authorization', `Bearer ${bearer(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ id: owner._id.toString(), email: owner.email });
    expect(res.body.data.user.owned_organizations).toEqual([{ id: org._id.toString(), name: org.name }]);
    expect(res.body.data.user.staff_memberships).toHaveLength(2);
  });

  test('creates organization, cafe, current subscription, and owner membership atomically for an active term', async () => {
    const admin = await makeUser({ name: 'Admin', email: 'active-admin@example.com', phone: '+15550110006', is_platform_admin: true });
    const owner = await makeUser({ email: 'active-owner@example.com', phone: '+15550110007' });

    const res = await request(app)
      .post('/api/v1/platform-admin/cafes')
      .set('Authorization', `Bearer ${bearer(admin)}`)
      .send(payloadFor(owner._id));

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      owner: { id: owner._id.toString(), name: owner.name, email: owner.email },
      organization: { name: 'Provisioning Organization' },
      cafe: { name: 'Provisioning Cafe', slug: 'provisioning-cafe', timezone: 'Asia/Kolkata' },
      subscription: { status: 'active', term_months: 12, price_per_month: 7000, is_current: true },
    });
    expect(new Date(res.body.data.subscription.current_period_end).getTime())
      .toBeGreaterThan(new Date(res.body.data.subscription.period_start).getTime());
    expect(await counts()).toEqual({ organizations: 1, cafes: 1, subscriptions: 1 });

    const refreshedOwner = await User.findById(owner._id);
    expect(refreshedOwner.staff_memberships).toEqual([
      expect.objectContaining({ cafe_id: expect.any(mongoose.Types.ObjectId), role: 'owner', permissions: [] }),
    ]);
    const cafe = await Cafe.findOne({ slug: 'provisioning-cafe' });
    expect(cafe.subscription_status).toBe('active');
    const audit = await AuditLog.findOne({ action: 'ONBOARD_CAFE', entity_id: cafe._id });
    expect(audit).toMatchObject({ entity_type: 'Cafe', cafe_id: cafe._id, performed_by: admin._id });
    expect(audit.after_state).toMatchObject({ owner_user_id: owner._id.toString(), cafe_id: cafe._id.toString() });
    expect(JSON.stringify(audit.after_state)).not.toContain(owner.email);
  });

  test('reuses an organization only when the selected owner owns an active cafe in it', async () => {
    const admin = await makeUser({ name: 'Admin', email: 'reuse-admin@example.com', phone: '+15550110008', is_platform_admin: true });
    const owner = await makeUser({ email: 'reuse-owner@example.com', phone: '+15550110009' });
    const org = await Organization.create({ name: 'Reusable Organization' });
    const existingCafe = await Cafe.create({ org_id: org._id, name: 'Existing Owner Cafe', slug: 'existing-owner-cafe', timezone: 'UTC' });
    owner.staff_memberships.push({ cafe_id: existingCafe._id, role: 'owner', permissions: [] });
    await owner.save();

    const res = await request(app)
      .post('/api/v1/platform-admin/cafes')
      .set('Authorization', `Bearer ${bearer(admin)}`)
      .send(payloadFor(owner._id, {
        organization: { mode: 'existing', id: org._id.toString() },
        cafe: { name: 'Second Owner Cafe', slug: 'second-owner-cafe', timezone: 'UTC', address: address() },
        subscription: { status: 'trial', term_months: 1, price_per_month: 0 },
      }));

    expect(res.status).toBe(201);
    expect(res.body.data.organization).toMatchObject({ id: org._id.toString(), name: org.name });
    expect(res.body.data.subscription).toMatchObject({ status: 'trial', term_months: 1, price_per_month: 0 });
    expect(await Organization.countDocuments()).toBe(1);
    const newCafe = await Cafe.findOne({ slug: 'second-owner-cafe' });
    expect(newCafe.org_id.toString()).toBe(org._id.toString());
    expect(newCafe.subscription_status).toBe('trial');
  });

  test('rejects reuse of an organization that the selected user does not own without writes', async () => {
    const admin = await makeUser({ name: 'Admin', email: 'invalid-reuse-admin@example.com', phone: '+15550110010', is_platform_admin: true });
    const owner = await makeUser({ email: 'invalid-reuse-owner@example.com', phone: '+15550110011' });
    const org = await Organization.create({ name: 'Not Owned Organization' });

    const res = await request(app)
      .post('/api/v1/platform-admin/cafes')
      .set('Authorization', `Bearer ${bearer(admin)}`)
      .send(payloadFor(owner._id, { organization: { mode: 'existing', id: org._id.toString() } }));

    expect(res.status).toBe(422);
    expect(await counts()).toEqual({ organizations: 1, cafes: 0, subscriptions: 0 });
    const refreshedOwner = await User.findById(owner._id);
    expect(refreshedOwner.staff_memberships).toEqual([]);
  });

  test('rejects malformed provisioning fields before writes', async () => {
    const admin = await makeUser({ name: 'Admin', email: 'validation-admin@example.com', phone: '+15550110012', is_platform_admin: true });
    const owner = await makeUser({ email: 'validation-owner@example.com', phone: '+15550110013' });

    const res = await request(app)
      .post('/api/v1/platform-admin/cafes')
      .set('Authorization', `Bearer ${bearer(admin)}`)
      .send(payloadFor(owner._id, {
        cafe: { name: '', slug: 'Not A Valid Slug', timezone: 'Not/A-Timezone' },
        subscription: { status: 'trial', term_months: 12, price_per_month: 1 },
      }));

    expect(res.status).toBe(400);
    expect(await counts()).toEqual({ organizations: 0, cafes: 0, subscriptions: 0 });
  });

  test.each([
    ['term-null', 'term_months', null],
    ['term-string', 'term_months', '12'],
    ['term-boolean', 'term_months', false],
    ['term-empty', 'term_months', ''],
    ['price-null', 'price_per_month', null],
    ['price-string', 'price_per_month', '7000'],
    ['price-boolean', 'price_per_month', false],
    ['price-empty', 'price_per_month', ''],
  ])('rejects non-numeric JSON %s for active subscriptions', async (caseName, field, invalidValue) => {
    const admin = await makeUser({
      name: 'Admin',
      email: `numeric-${caseName}@example.com`,
      phone: field === 'term_months' ? '+15550110020' : '+15550110021',
      is_platform_admin: true,
    });
    const owner = await makeUser({
      email: `numeric-owner-${caseName}@example.com`,
      phone: field === 'term_months' ? '+15550110022' : '+15550110023',
    });

    const res = await request(app)
      .post('/api/v1/platform-admin/cafes')
      .set('Authorization', `Bearer ${bearer(admin)}`)
      .send(payloadFor(owner._id, {
        cafe: { name: 'Numeric Validation Cafe', slug: `numeric-${caseName}`, timezone: 'UTC', address: address() },
        subscription: {
          status: 'active',
          term_months: field === 'term_months' ? invalidValue : 12,
          price_per_month: field === 'price_per_month' ? invalidValue : 7000,
        },
      }));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(`subscription.${field} must be a JSON number`);
    expect(await counts()).toEqual({ organizations: 0, cafes: 0, subscriptions: 0 });
  });

  test('returns one success and controlled conflicts for concurrent duplicate slugs', async () => {
    await Cafe.init();
    const admin = await makeUser({ name: 'Admin', email: 'concurrent-admin@example.com', phone: '+15550110014', is_platform_admin: true });
    const owner = await makeUser({ email: 'concurrent-owner@example.com', phone: '+15550110015' });
    const payload = payloadFor(owner._id, { cafe: { name: 'Concurrent Cafe', slug: 'concurrent-cafe', timezone: 'UTC', address: address() } });

    const responses = await Promise.all([
      request(app).post('/api/v1/platform-admin/cafes').set('Authorization', `Bearer ${bearer(admin)}`).send(payload),
      request(app).post('/api/v1/platform-admin/cafes').set('Authorization', `Bearer ${bearer(admin)}`).send(payload),
    ]);

    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(1);
    expect(await counts()).toEqual({ organizations: 1, cafes: 1, subscriptions: 1 });
  });

  test('rolls back the complete graph when the final membership step fails', async () => {
    const admin = await makeUser({ name: 'Admin', email: 'rollback-admin@example.com', phone: '+15550110016', is_platform_admin: true });
    const owner = await makeUser({ email: 'rollback-owner@example.com', phone: '+15550110017' });
    const membershipUpdateSpy = jest.spyOn(User, 'updateOne').mockRejectedValue(new Error('forced membership failure'));

    try {
      await expect(provisionCafe({
        ...payloadFor(owner._id),
        adminUserId: admin._id,
      })).rejects.toThrow('forced membership failure');
    } finally {
      membershipUpdateSpy.mockRestore();
    }

    expect(await counts()).toEqual({ organizations: 0, cafes: 0, subscriptions: 0 });
    expect((await User.findById(owner._id)).staff_memberships).toEqual([]);
  });

  test('rolls back the cafe and organization when the subscription write fails', async () => {
    const admin = await makeUser({ name: 'Admin', email: 'subscription-rollback-admin@example.com', phone: '+15550110024', is_platform_admin: true });
    const owner = await makeUser({ email: 'subscription-rollback-owner@example.com', phone: '+15550110025' });
    const subscriptionSaveSpy = jest.spyOn(Subscription.prototype, 'save').mockRejectedValue(new Error('forced subscription failure'));

    try {
      await expect(provisionCafe({
        ...payloadFor(owner._id, { cafe: { name: 'Subscription Failure Cafe', slug: 'subscription-failure-cafe', timezone: 'UTC', address: address() } }),
        adminUserId: admin._id,
      })).rejects.toThrow('forced subscription failure');
    } finally {
      subscriptionSaveSpy.mockRestore();
    }

    expect(await counts()).toEqual({ organizations: 0, cafes: 0, subscriptions: 0 });
    expect((await User.findById(owner._id)).staff_memberships).toEqual([]);
  });

  test('fails closed before writes when transaction topology is unavailable', async () => {
    const admin = await makeUser({ name: 'Admin', email: 'topology-admin@example.com', phone: '+15550110018', is_platform_admin: true });
    const owner = await makeUser({ email: 'topology-owner@example.com', phone: '+15550110019' });
    const adminSpy = jest.spyOn(mongoose.connection.db, 'admin').mockReturnValue({
      command: jest.fn().mockResolvedValue({}),
    });

    try {
      await expect(provisionCafe({ ...payloadFor(owner._id), adminUserId: admin._id }))
        .rejects.toMatchObject({ statusCode: 503, code: 'MONGO_TRANSACTIONS_UNSUPPORTED' });
    } finally {
      adminSpy.mockRestore();
    }

    expect(await counts()).toEqual({ organizations: 0, cafes: 0, subscriptions: 0 });
  });

  test('returns 503 without writes from the HTTP endpoint when transaction topology cannot be inspected', async () => {
    const admin = await makeUser({ name: 'Admin', email: 'http-topology-admin@example.com', phone: '+15550110026', is_platform_admin: true });
    const owner = await makeUser({ email: 'http-topology-owner@example.com', phone: '+15550110027' });
    const adminSpy = jest.spyOn(mongoose.connection.db, 'admin').mockReturnValue({
      command: jest.fn().mockRejectedValue(new Error('topology unavailable')),
    });

    try {
      const res = await request(app)
        .post('/api/v1/platform-admin/cafes')
        .set('Authorization', `Bearer ${bearer(admin)}`)
        .send(payloadFor(owner._id, { cafe: { name: 'Unavailable Topology Cafe', slug: 'unavailable-topology-cafe', timezone: 'UTC', address: address() } }));

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('MongoTransactionTopologyError');
      expect(await counts()).toEqual({ organizations: 0, cafes: 0, subscriptions: 0 });
    } finally {
      adminSpy.mockRestore();
    }
  });
});
