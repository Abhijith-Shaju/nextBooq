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

// M-05: the unique index used to be { cafe_id, table_number, is_deleted },
// which let two *deleted* rows for the same table_number collide (create ->
// delete -> recreate -> delete again writes a second deleted document with
// the same key), surfacing as a confusing E11000 duplicate-key 409 on an
// ordinary delete.
describe('Integration Test: a soft-deleted table_number can be reused and re-deleted', () => {
  let cafe;
  let ownerToken;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Table Reuse Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Table Reuse Cafe',
      slug: `table-reuse-cafe-${Date.now()}`,
      timezone: 'UTC',
      subscription_status: 'active',
    });
    const owner = await User.create({
      name: 'Owner',
      email: `table-reuse-owner-${Date.now()}@test.com`,
      phone: '+15559990201',
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [{ cafe_id: cafe._id, role: 'owner', permissions: [] }],
    });
    ownerToken = jwt.sign({ id: owner._id.toString() }, config.JWT_SECRET);
  });

  const createTable = (tableNumber) =>
    request(app)
      .post(`/api/v1/cafes/${cafe._id}/tables`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ table_number: tableNumber, capacity: 4 });

  const deleteTable = (tableId) =>
    request(app)
      .put(`/api/v1/cafes/${cafe._id}/tables/${tableId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ is_deleted: true });

  test('a table_number can be deleted, recreated, and deleted again without a duplicate-key error', async () => {
    const first = await createTable('5');
    expect(first.status).toBe(201);
    const firstDelete = await deleteTable(first.body.data._id);
    expect(firstDelete.status).toBe(200);

    const second = await createTable('5');
    expect(second.status).toBe(201);
    const secondDelete = await deleteTable(second.body.data._id);
    expect(secondDelete.status).toBe(200);

    const liveTables = await Table.find({ cafe_id: cafe._id, is_deleted: false });
    expect(liveTables).toHaveLength(0);
    const allTables = await Table.find({ cafe_id: cafe._id });
    expect(allTables).toHaveLength(2);
  });

  test('two live tables with the same table_number are still rejected', async () => {
    const first = await createTable('7');
    expect(first.status).toBe(201);

    const duplicate = await createTable('7');
    expect(duplicate.status).toBe(409);
  });
});
