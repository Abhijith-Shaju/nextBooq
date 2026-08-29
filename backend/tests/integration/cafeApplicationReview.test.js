const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const User = require('../../src/models/User');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const Subscription = require('../../src/models/Subscription');
const CafeApplication = require('../../src/models/CafeApplication');
const { setupTestDB } = require('../setup');

setupTestDB();

let userSeq = 0;
const makeUser = (overrides = {}) => {
  userSeq += 1;
  return User.create({
    name: 'Applicant',
    email: `review-${userSeq}@example.com`,
    phone: `+1555016${String(1000 + userSeq)}`,
    password_hash: 'x',
    is_email_verified: true,
    ...overrides,
  });
};

const bearer = (user) => jwt.sign({ id: user._id.toString(), tv: user.token_version }, config.JWT_SECRET);

const makeApplication = (user, overrides = {}) =>
  CafeApplication.create({
    application_ref: `NB-TEST-${String(1000 + userSeq)}`,
    applicant_user_id: user._id,
    organization_name: 'Filter Kaapi Co',
    cafe_name: 'Filter Kaapi',
    cafe_slug: `filter-kaapi-${userSeq}`,
    timezone: 'Asia/Kolkata',
    address: { line1: '12 Church Street', city: 'Bengaluru', state: 'Karnataka', postal_code: '560001' },
    ...overrides,
  });

const trialSubscription = { status: 'trial', term_months: 1, price_per_month: 0 };

describe('platform-admin cafe application review', () => {
  test('rejects a non-admin from listing, approving and rejecting', async () => {
    const applicant = await makeUser();
    const application = await makeApplication(applicant);

    const [list, approve, reject] = await Promise.all([
      request(app).get('/api/v1/platform-admin/cafe-applications').set('Authorization', `Bearer ${bearer(applicant)}`),
      request(app).post(`/api/v1/platform-admin/cafe-applications/${application._id}/approve`).set('Authorization', `Bearer ${bearer(applicant)}`).send({ subscription: trialSubscription }),
      request(app).post(`/api/v1/platform-admin/cafe-applications/${application._id}/reject`).set('Authorization', `Bearer ${bearer(applicant)}`).send({ note: 'no' }),
    ]);

    expect([list.status, approve.status, reject.status]).toEqual([403, 403, 403]);
    expect(await Cafe.countDocuments()).toBe(0);
  });

  test('approving provisions the org, cafe, subscription and owner membership', async () => {
    const admin = await makeUser({ is_platform_admin: true });
    const applicant = await makeUser();
    const application = await makeApplication(applicant);

    const res = await request(app)
      .post(`/api/v1/platform-admin/cafe-applications/${application._id}/approve`)
      .set('Authorization', `Bearer ${bearer(admin)}`)
      .send({ subscription: trialSubscription });

    expect(res.status).toBe(200);

    const cafe = await Cafe.findOne({ slug: application.cafe_slug });
    expect(cafe).not.toBeNull();
    expect(cafe.address.line1).toBe('12 Church Street');
    expect(await Organization.countDocuments()).toBe(1);
    expect(await Subscription.countDocuments({ cafe_id: cafe._id, is_current: true })).toBe(1);

    const owner = await User.findById(applicant._id);
    expect(owner.staff_memberships).toHaveLength(1);
    expect(owner.staff_memberships[0].role).toBe('owner');

    const stored = await CafeApplication.findById(application._id);
    expect(stored.status).toBe('approved');
    expect(stored.provisioned_cafe_id.toString()).toBe(cafe._id.toString());
    expect(stored.reviewed_by_user_id.toString()).toBe(admin._id.toString());
    expect(stored.reviewed_at).not.toBeNull();
  });

  test('a slug taken between submit and approve leaves the application pending and writes nothing', async () => {
    const admin = await makeUser({ is_platform_admin: true });
    const applicant = await makeUser();
    const application = await makeApplication(applicant);

    const squatterOrg = await Organization.create({ name: 'Squatter Organization' });
    await Cafe.create({
      org_id: squatterOrg._id, name: 'Squatter', slug: application.cafe_slug, timezone: 'UTC',
    });

    const res = await request(app)
      .post(`/api/v1/platform-admin/cafe-applications/${application._id}/approve`)
      .set('Authorization', `Bearer ${bearer(admin)}`)
      .send({ subscription: trialSubscription });

    expect(res.status).toBe(409);

    const stored = await CafeApplication.findById(application._id);
    expect(stored.status).toBe('pending');
    expect(stored.provisioned_cafe_id).toBeNull();
    // Only the squatter's org exists — no half-applied provisioning.
    expect(await Organization.countDocuments()).toBe(1);
    expect(await Subscription.countDocuments()).toBe(0);
  });

  test('approving an already-approved application is refused', async () => {
    const admin = await makeUser({ is_platform_admin: true });
    const applicant = await makeUser();
    const application = await makeApplication(applicant);

    await request(app)
      .post(`/api/v1/platform-admin/cafe-applications/${application._id}/approve`)
      .set('Authorization', `Bearer ${bearer(admin)}`)
      .send({ subscription: trialSubscription });

    const second = await request(app)
      .post(`/api/v1/platform-admin/cafe-applications/${application._id}/approve`)
      .set('Authorization', `Bearer ${bearer(admin)}`)
      .send({ subscription: trialSubscription });

    expect(second.status).toBe(409);
    expect(await Cafe.countDocuments()).toBe(1);
  });

  test('rejecting records the note and permits a fresh application', async () => {
    const admin = await makeUser({ is_platform_admin: true });
    const applicant = await makeUser();
    const application = await makeApplication(applicant);

    const res = await request(app)
      .post(`/api/v1/platform-admin/cafe-applications/${application._id}/reject`)
      .set('Authorization', `Bearer ${bearer(admin)}`)
      .send({ note: 'Could not verify the address' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('rejected');
    expect(res.body.data.review_note).toBe('Could not verify the address');
    expect(await Cafe.countDocuments()).toBe(0);

    const fresh = await request(app)
      .post('/api/v1/cafe-applications')
      .set('Authorization', `Bearer ${bearer(applicant)}`)
      .send({
        organization_name: 'Filter Kaapi Co',
        cafe_name: 'Filter Kaapi',
        cafe_slug: 'filter-kaapi-retry',
        timezone: 'Asia/Kolkata',
        address: { line1: '12 Church Street', city: 'Bengaluru', state: 'Karnataka', postal_code: '560001' },
      });
    expect(fresh.status).toBe(201);
  });

  test('rejecting without a note is refused', async () => {
    const admin = await makeUser({ is_platform_admin: true });
    const applicant = await makeUser();
    const application = await makeApplication(applicant);

    const res = await request(app)
      .post(`/api/v1/platform-admin/cafe-applications/${application._id}/reject`)
      .set('Authorization', `Bearer ${bearer(admin)}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('lists pending applications newest first with the applicant attached', async () => {
    const admin = await makeUser({ is_platform_admin: true });
    const first = await makeUser();
    await makeApplication(first);
    const second = await makeUser();
    await makeApplication(second);

    const res = await request(app)
      .get('/api/v1/platform-admin/cafe-applications?status=pending')
      .set('Authorization', `Bearer ${bearer(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].applicant.email).toBe(second.email);
  });
});
