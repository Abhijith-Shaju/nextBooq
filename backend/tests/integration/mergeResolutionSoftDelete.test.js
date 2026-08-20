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

describe('Integration Test: merge resolution excludes soft-deleted tables', () => {
  let cafe;
  let ownerToken;
  let primaryTable;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Merge Resolution Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Merge Resolution Cafe',
      slug: 'merge-resolution-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });
    const owner = await User.create({
      name: 'Owner',
      email: 'owner-merge-resolution@test.com',
      phone: '+1555666001',
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [{ cafe_id: cafe._id, role: 'owner', permissions: [] }],
    });
    ownerToken = jwt.sign({ id: owner._id.toString() }, config.JWT_SECRET);

    primaryTable = await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 2 });
  });

  test('table_number reuse: a merge request cannot resolve to a soft-deleted table sharing that number', async () => {
    // Deleted "T2" is soft-deleted, then a brand-new active table is also
    // numbered "T2" (the unique index scopes on is_deleted, so this is legal).
    const deletedT2 = await Table.create({
      cafe_id: cafe._id,
      table_number: 'T2',
      capacity: 4,
      is_deleted: true,
    });
    const newT2 = await Table.create({ cafe_id: cafe._id, table_number: 'T2', capacity: 6 });

    const res = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/tables/${primaryTable._id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ can_merge_with: ['T2'] });

    expect(res.status).toBe(200);
    const mergeIds = res.body.data.can_merge_with.map(String);
    expect(mergeIds).toEqual([String(newT2._id)]);
    expect(mergeIds).not.toContain(String(deletedT2._id));
  });

  test('merge request against only a soft-deleted table_number is rejected as unresolved', async () => {
    await Table.create({
      cafe_id: cafe._id,
      table_number: 'T3',
      capacity: 4,
      is_deleted: true,
    });

    const res = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/tables/${primaryTable._id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ can_merge_with: ['T3'] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/unknown table_number/i);
  });
});
