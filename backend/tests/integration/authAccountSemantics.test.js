const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const User = require('../../src/models/User');
const Organization = require('../../src/models/Organization');
const Cafe = require('../../src/models/Cafe');
const Subscription = require('../../src/models/Subscription');
const { setupTestDB } = require('../setup');

setupTestDB();

const registration = {
  name: 'Normal Account',
  email: 'normal-account@example.com',
  phone: '+15550100001',
  password: 'NormalAccountPassword1!',
};

const expectedAuthUserKeys = [
  'account_type',
  'cafe_application',
  'created_at',
  'email',
  'id',
  'is_email_verified',
  'is_platform_admin',
  'name',
  'owner_org_id',
  'pending_email',
  'phone',
  'staff_memberships',
].sort();

describe('normal account semantics', () => {
  test('platform-admin login and me responses expose platform-admin authority for navigation policy', async () => {
    const password_hash = await bcrypt.hash('PlatformAdminPassword1!', 10);
    await User.create({
      name: 'Platform Admin',
      email: 'platform-admin-login@example.com',
      phone: '+15550100004',
      password_hash,
      is_platform_admin: true,
    });

    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'PLATFORM-ADMIN-LOGIN@EXAMPLE.COM',
      password: 'PlatformAdminPassword1!',
    });

    expect(login.status).toBe(200);
    expect(Object.keys(login.body.data.user).sort()).toEqual(expectedAuthUserKeys);
    expect(login.body.data.user).toMatchObject({
      email: 'platform-admin-login@example.com',
      is_platform_admin: true,
      staff_memberships: [],
    });

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.data.token}`);

    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({
      email: 'platform-admin-login@example.com',
      is_platform_admin: true,
      staff_memberships: [],
    });
  });

  test('an org owner (owner role on every cafe in their org) gets owner_org_id on login and me', async () => {
    const Organization = require('../../src/models/Organization');
    const Cafe = require('../../src/models/Cafe');
    const org = await Organization.create({ name: 'Owner Semantics Org' });
    const cafe = await Cafe.create({ org_id: org._id, name: 'Cafe', slug: 'owner-semantics-cafe', timezone: 'UTC' });

    const password_hash = await bcrypt.hash('OrgOwnerPassword1!', 10);
    await User.create({
      name: 'Org Owner',
      email: 'org-owner-login@example.com',
      phone: '+15550100005',
      password_hash,
      staff_memberships: [{ cafe_id: cafe._id, role: 'owner', permissions: [] }],
    });

    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'org-owner-login@example.com',
      password: 'OrgOwnerPassword1!',
    });

    expect(login.status).toBe(200);
    expect(login.body.data.user.owner_org_id).toBe(org._id.toString());

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.data.token}`);

    expect(me.status).toBe(200);
    expect(me.body.data.owner_org_id).toBe(org._id.toString());
  });

  test('a manager (not owner of every cafe) gets owner_org_id null', async () => {
    const Organization = require('../../src/models/Organization');
    const Cafe = require('../../src/models/Cafe');
    const org = await Organization.create({ name: 'Manager Semantics Org' });
    const cafe = await Cafe.create({ org_id: org._id, name: 'Cafe', slug: 'manager-semantics-cafe', timezone: 'UTC' });

    const password_hash = await bcrypt.hash('ManagerPassword1!', 10);
    await User.create({
      name: 'Manager',
      email: 'manager-semantics-login@example.com',
      phone: '+15550100006',
      password_hash,
      staff_memberships: [{ cafe_id: cafe._id, role: 'manager', permissions: [] }],
    });

    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'manager-semantics-login@example.com',
      password: 'ManagerPassword1!',
    });

    expect(login.status).toBe(200);
    expect(login.body.data.user.owner_org_id).toBeNull();
  });

  test('registration creates only a normal account and returns the normalized auth user', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ ...registration, accept_terms: true });

    expect(res.status).toBe(201);
    expect(Object.keys(res.body.data.user).sort()).toEqual(expectedAuthUserKeys);
    expect(res.body.data.user).toMatchObject({
      name: 'Normal Account',
      email: 'normal-account@example.com',
      phone: '+15550100001',
      is_platform_admin: false,
      staff_memberships: [],
    });
    await expect(User.countDocuments()).resolves.toBe(1);
    await expect(Organization.countDocuments()).resolves.toBe(0);
    await expect(Cafe.countDocuments()).resolves.toBe(0);
    await expect(Subscription.countDocuments()).resolves.toBe(0);
  });

  test('login trims email and only returns memberships whose cafes are still active', async () => {
    const org = await Organization.create({ name: 'Membership Org' });
    const activeCafe = await Cafe.create({
      org_id: org._id,
      name: 'Active Cafe',
      slug: 'active-membership-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });
    const deletedCafe = await Cafe.create({
      org_id: org._id,
      name: 'Deleted Cafe',
      slug: 'deleted-membership-cafe',
      timezone: 'UTC',
      subscription_status: 'inactive',
      is_deleted: true,
    });
    const password_hash = await bcrypt.hash('ExistingAccountPassword1!', 10);
    await User.create({
      name: 'Existing Account',
      email: 'existing-account@example.com',
      phone: '+15550100002',
      password_hash,
      staff_memberships: [
        { cafe_id: deletedCafe._id, role: 'staff', permissions: [] },
        { cafe_id: activeCafe._id, role: 'manager', permissions: [] },
      ],
    });

    const res = await request(app).post('/api/v1/auth/login').send({
      email: '  EXISTING-ACCOUNT@EXAMPLE.COM  ',
      password: 'ExistingAccountPassword1!',
    });

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data.user).sort()).toEqual(expectedAuthUserKeys);
    expect(res.body.data.user.is_platform_admin).toBe(false);
    expect(res.body.data.user.staff_memberships).toHaveLength(1);
    expect(res.body.data.user.staff_memberships[0]).toMatchObject({
      role: 'manager',
      cafe_id: { slug: 'active-membership-cafe' },
    });
  });

  test('quick auth and me return the same normalized account fields', async () => {
    const quickAuth = await request(app).post('/api/v1/auth/customer-quick-auth').send({ accept_terms: true,
      name: 'Quick Customer',
      email: 'quick-customer@example.com',
      phone: '+15550100003',
      password: 'QuickCustomerPassword1!',
    });

    expect(quickAuth.status).toBe(200);
    expect(Object.keys(quickAuth.body.data.user).sort()).toEqual(expectedAuthUserKeys);
    expect(quickAuth.body.data.user).toMatchObject({
      is_platform_admin: false,
      staff_memberships: [],
    });

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${quickAuth.body.data.token}`);

    expect(me.status).toBe(200);
    expect(Object.keys(me.body.data).sort()).toEqual(expectedAuthUserKeys);
    expect(me.body.data).toMatchObject({
      is_platform_admin: false,
      staff_memberships: [],
    });
  });
});

describe('legacy self-service cafe creation is unavailable', () => {
  test('a registered normal account cannot create an organization, cafe, owner membership, or subscription', async () => {
    const registrationRes = await request(app).post('/api/v1/auth/register').send({ ...registration, accept_terms: true });
    const userId = registrationRes.body.data.user.id;

    const res = await request(app)
      .post('/api/v1/cafes')
      .set('Authorization', `Bearer ${registrationRes.body.data.token}`)
      .send({
        org_name: 'Forbidden Organization',
        cafe_name: 'Forbidden Cafe',
        slug: 'forbidden-cafe',
        timezone: 'UTC',
      });

    expect(res.status).toBe(404);
    await expect(Organization.countDocuments()).resolves.toBe(0);
    await expect(Cafe.countDocuments()).resolves.toBe(0);
    await expect(Subscription.countDocuments()).resolves.toBe(0);

    const user = await User.findById(userId);
    expect(user.staff_memberships).toEqual([]);
  });
});
