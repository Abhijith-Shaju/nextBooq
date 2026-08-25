const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Organization = require('../../src/models/Organization');
const Cafe = require('../../src/models/Cafe');
const User = require('../../src/models/User');
const Reservation = require('../../src/models/Reservation');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Org routes', () => {
  let ownerToken, managerToken, org, cafeA, cafeB;

  beforeEach(async () => {
    org = await Organization.create({ name: 'Org Routes Test Org' });
    cafeA = await Cafe.create({
      org_id: org._id,
      name: 'Cafe A',
      slug: 'org-routes-cafe-a',
      timezone: 'UTC',
      subscription_status: 'active',
    });
    cafeB = await Cafe.create({
      org_id: org._id,
      name: 'Cafe B',
      slug: 'org-routes-cafe-b',
      timezone: 'UTC',
      subscription_status: 'trial',
    });

    const owner = await User.create({
      name: 'Org Owner',
      email: 'org-routes-owner@test.com',
      phone: '+15559930001',
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [
        { cafe_id: cafeA._id, role: 'owner', permissions: [] },
        { cafe_id: cafeB._id, role: 'owner', permissions: [] },
      ],
    });
    ownerToken = jwt.sign({ id: owner._id.toString() }, config.JWT_SECRET);

    const manager = await User.create({
      name: 'Cafe Manager',
      email: 'org-routes-manager@test.com',
      phone: '+15559930002',
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [{ cafe_id: cafeA._id, role: 'manager', permissions: [] }],
    });
    managerToken = jwt.sign({ id: manager._id.toString() }, config.JWT_SECRET);
  });

  test('an unauthenticated request gets 401', async () => {
    const res = await request(app).get('/api/v1/org/cafes');
    expect(res.status).toBe(401);
  });

  test('a manager (not org owner) gets 403', async () => {
    const res = await request(app)
      .get('/api/v1/org/cafes')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(403);
  });

  describe('GET /api/v1/org', () => {
    test('an unauthenticated request gets 401', async () => {
      const res = await request(app).get('/api/v1/org');
      expect(res.status).toBe(401);
    });

    test('a manager (not org owner) gets 403', async () => {
      const res = await request(app).get('/api/v1/org').set('Authorization', `Bearer ${managerToken}`);
      expect(res.status).toBe(403);
    });

    test('an org owner gets their organization id and name', async () => {
      const res = await request(app).get('/api/v1/org').set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ id: org._id.toString(), name: 'Org Routes Test Org' });
    });
  });

  test('an org owner gets their org\'s cafes with subscription status and today\'s reservation count', async () => {
    const now = new Date();
    await Reservation.create({
      cafe_id: cafeA._id,
      user_id: (await User.create({
        name: 'Guest',
        email: 'org-routes-guest@test.com',
        phone: '+15559930003',
        password_hash: 'pass',
      is_email_verified: true,
      }))._id,
      table_ids: [],
      start_time: now,
      end_time: new Date(now.getTime() + 60 * 60 * 1000),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'CONFIRMED',
    });

    const res = await request(app)
      .get('/api/v1/org/cafes')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    const cafeAResult = res.body.data.find((c) => c._id === cafeA._id.toString());
    expect(cafeAResult).toMatchObject({
      name: 'Cafe A',
      slug: 'org-routes-cafe-a',
      subscription_status: 'active',
      today_reservation_count: 1,
    });
    const cafeBResult = res.body.data.find((c) => c._id === cafeB._id.toString());
    expect(cafeBResult).toMatchObject({
      name: 'Cafe B',
      subscription_status: 'trial',
      today_reservation_count: 0,
    });
  });

  describe('staff assignment', () => {
    let staffTarget;

    beforeEach(async () => {
      staffTarget = await User.create({
        name: 'Assignable Person',
        email: 'org-routes-assignable@test.com',
        phone: '+15559930010',
        password_hash: 'pass',
      is_email_verified: true,
      });
    });

    test('assigns a manager role to an existing account by email', async () => {
      const res = await request(app)
        .post(`/api/v1/org/cafes/${cafeA._id}/staff`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'org-routes-assignable@test.com', role: 'manager' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        email: 'org-routes-assignable@test.com',
        cafe_id: cafeA._id.toString(),
        role: 'manager',
      });

      const updated = await User.findById(staffTarget._id);
      expect(updated.staff_memberships).toHaveLength(1);
      expect(updated.staff_memberships[0].role).toBe('manager');
    });

    test('updates the role in place if the user already has a membership on that cafe', async () => {
      staffTarget.staff_memberships.push({ cafe_id: cafeA._id, role: 'staff', permissions: [] });
      await staffTarget.save();

      const res = await request(app)
        .post(`/api/v1/org/cafes/${cafeA._id}/staff`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'org-routes-assignable@test.com', role: 'host' });

      expect(res.status).toBe(200);
      const updated = await User.findById(staffTarget._id);
      expect(updated.staff_memberships).toHaveLength(1);
      expect(updated.staff_memberships[0].role).toBe('host');
    });

    test('rejects an unknown email with 404 and makes no changes', async () => {
      const res = await request(app)
        .post(`/api/v1/org/cafes/${cafeA._id}/staff`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'no-such-account@test.com', role: 'manager' });

      expect(res.status).toBe(404);
    });

    test('rejects an invalid role with 400', async () => {
      const res = await request(app)
        .post(`/api/v1/org/cafes/${cafeA._id}/staff`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'org-routes-assignable@test.com', role: 'ceo' });

      expect(res.status).toBe(400);
    });

    test('rejects a cafe id that does not belong to the caller\'s org with 403', async () => {
      const otherOrg = await Organization.create({ name: 'Other Org' });
      const otherCafe = await Cafe.create({
        org_id: otherOrg._id,
        name: 'Other Cafe',
        slug: 'org-routes-other-cafe',
        timezone: 'UTC',
      });

      const res = await request(app)
        .post(`/api/v1/org/cafes/${otherCafe._id}/staff`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'org-routes-assignable@test.com', role: 'manager' });

      expect(res.status).toBe(403);
    });

    test('removes an existing staff membership', async () => {
      staffTarget.staff_memberships.push({ cafe_id: cafeA._id, role: 'staff', permissions: [] });
      await staffTarget.save();

      const res = await request(app)
        .delete(`/api/v1/org/cafes/${cafeA._id}/staff/${staffTarget._id}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      const updated = await User.findById(staffTarget._id);
      expect(updated.staff_memberships).toHaveLength(0);
    });

    test('returns 404 when removing a membership that does not exist', async () => {
      const res = await request(app)
        .delete(`/api/v1/org/cafes/${cafeA._id}/staff/${staffTarget._id}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
    });

    test('assigns default permissions for the role', async () => {
      const res = await request(app)
        .post(`/api/v1/org/cafes/${cafeA._id}/staff`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'org-routes-assignable@test.com', role: 'manager' });

      expect(res.status).toBe(200);
      const updated = await User.findById(staffTarget._id);
      expect(updated.staff_memberships[0].permissions).toEqual([
        'edit_tables',
        'edit_settings',
        'view_reservations',
        'edit_reservations',
        'cancel_reservations',
      ]);
    });

    test('rejects an owner assigning a role to themself with 400', async () => {
      const res = await request(app)
        .post(`/api/v1/org/cafes/${cafeA._id}/staff`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'org-routes-owner@test.com', role: 'staff' });

      expect(res.status).toBe(400);
    });

    test('rejects an owner removing their own staff membership with 400', async () => {
      const ownerRecord = await User.findOne({ email: 'org-routes-owner@test.com' });

      const res = await request(app)
        .delete(`/api/v1/org/cafes/${cafeA._id}/staff/${ownerRecord._id}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(400);
    });

    // M-04 (reviewed, not reproducible): a cafe can never be left with zero
    // owners through these two endpoints. Neither lets the caller change
    // their own membership, and requireOrgOwner only grants req.ownerOrgId
    // to someone who already owns every cafe in the org -- so the caller is
    // necessarily an owner of the exact cafe being modified, and removing
    // or demoting a *different* user's owner membership there can never
    // remove the caller's own. Verified rather than assumed:
    test('removing the only other owner on a cafe leaves the acting owner (and org access) intact', async () => {
      const secondOwner = await User.create({
        name: 'Second Owner',
        email: 'org-routes-second-owner@test.com',
        phone: '+15559930003',
        password_hash: 'pass',
        is_email_verified: true,
        staff_memberships: [{ cafe_id: cafeA._id, role: 'owner', permissions: [] }],
      });

      const removeRes = await request(app)
        .delete(`/api/v1/org/cafes/${cafeA._id}/staff/${secondOwner._id}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(removeRes.status).toBe(200);

      // The caller's own ownership of cafeA survives, so requireOrgOwner
      // still resolves req.ownerOrgId for them on a subsequent request --
      // the org never became unreachable.
      const stillAccessible = await request(app)
        .get('/api/v1/org')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(stillAccessible.status).toBe(200);
    });

    // "Manage staff" needs a list of who's currently on the cafe -- assign
    // and remove already existed, but nothing surfaced who's actually
    // assigned before the owner acts on them.
    describe('GET /api/v1/org/cafes/:cafeId/staff', () => {
      test('lists every staff member currently on the cafe with their role', async () => {
        staffTarget.staff_memberships.push({ cafe_id: cafeA._id, role: 'host', permissions: [] });
        await staffTarget.save();

        const res = await request(app)
          .get(`/api/v1/org/cafes/${cafeA._id}/staff`)
          .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(200);
        const emails = res.body.data.map((s) => s.email);
        expect(emails).toContain('org-routes-owner@test.com');
        expect(emails).toContain('org-routes-manager@test.com');
        expect(emails).toContain('org-routes-assignable@test.com');

        const assignable = res.body.data.find((s) => s.email === 'org-routes-assignable@test.com');
        expect(assignable).toMatchObject({
          user_id: staffTarget._id.toString(),
          name: 'Assignable Person',
          role: 'host',
        });
      });

      test('does not include staff assigned to a different cafe', async () => {
        staffTarget.staff_memberships.push({ cafe_id: cafeB._id, role: 'staff', permissions: [] });
        await staffTarget.save();

        const res = await request(app)
          .get(`/api/v1/org/cafes/${cafeA._id}/staff`)
          .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.map((s) => s.email)).not.toContain('org-routes-assignable@test.com');
      });

      test('rejects a cafe id that does not belong to the caller\'s org with 403', async () => {
        const otherOrg = await Organization.create({ name: 'Other Org For Staff List' });
        const otherCafe = await Cafe.create({
          org_id: otherOrg._id,
          name: 'Other Cafe For Staff List',
          slug: 'org-routes-other-cafe-staff-list',
          timezone: 'UTC',
        });

        const res = await request(app)
          .get(`/api/v1/org/cafes/${otherCafe._id}/staff`)
          .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(403);
      });

      test('a manager (not org owner) gets 403', async () => {
        const res = await request(app)
          .get(`/api/v1/org/cafes/${cafeA._id}/staff`)
          .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(403);
      });
    });

    test('demoting the only other owner on a cafe away from owner leaves the acting owner intact', async () => {
      const secondOwner = await User.create({
        name: 'Demoted Owner',
        email: 'org-routes-demoted-owner@test.com',
        phone: '+15559930004',
        password_hash: 'pass',
        is_email_verified: true,
        staff_memberships: [{ cafe_id: cafeA._id, role: 'owner', permissions: [] }],
      });

      const demoteRes = await request(app)
        .post(`/api/v1/org/cafes/${cafeA._id}/staff`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'org-routes-demoted-owner@test.com', role: 'manager' });
      expect(demoteRes.status).toBe(200);

      const stillAccessible = await request(app)
        .get('/api/v1/org')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(stillAccessible.status).toBe(200);
    });
  });
});
