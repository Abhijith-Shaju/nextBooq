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

describe('Integration Test: GET /tables populates can_merge_with with table_number', () => {
  test('returns table_number (not just the raw ObjectId) for each merge partner', async () => {
    const org = await Organization.create({ name: 'Merge Populate Org' });
    const cafe = await Cafe.create({
      org_id: org._id,
      name: 'Merge Populate Cafe',
      slug: 'merge-populate-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });
    const owner = await User.create({
      name: 'Owner',
      email: 'owner-merge-pop@test.com',
      phone: '+1555700001',
      password_hash: 'pass',
      staff_memberships: [{ cafe_id: cafe._id, role: 'owner', permissions: [] }],
    });
    const token = jwt.sign({ id: owner._id.toString() }, config.JWT_SECRET);

    const partner = await Table.create({ cafe_id: cafe._id, table_number: '2', capacity: 2 });
    const table = await Table.create({
      cafe_id: cafe._id,
      table_number: '1',
      capacity: 4,
      can_merge_with: [partner._id],
    });

    const res = await request(app)
      .get(`/api/v1/cafes/${cafe._id}/tables`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const returnedTable = res.body.data.find((t) => t._id === table._id.toString());
    expect(returnedTable.can_merge_with).toEqual([
      expect.objectContaining({ _id: partner._id.toString(), table_number: '2' }),
    ]);
  });
});
