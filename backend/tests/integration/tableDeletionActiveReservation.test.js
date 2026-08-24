const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const Reservation = require('../../src/models/Reservation');
const { setupTestDB } = require('../setup');

setupTestDB();

// M-06: assertCapacityReductionIsSafe already blocked a capacity change that
// would strand a booked party, but deletion (is_deleted: true) ran no
// equivalent check -- a confirmed reservation could keep pointing at a
// table the allocation engine now filters out and the floorplan no longer
// draws.
describe('Integration Test: a table with an active reservation cannot be deleted', () => {
  let cafe;
  let ownerToken;
  let table;
  let customer;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Table Delete Guard Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Table Delete Guard Cafe',
      slug: `table-delete-guard-cafe-${Date.now()}`,
      timezone: 'UTC',
      subscription_status: 'active',
    });
    const owner = await User.create({
      name: 'Owner',
      email: `table-delete-owner-${Date.now()}@test.com`,
      phone: '+15559990301',
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [{ cafe_id: cafe._id, role: 'owner', permissions: [] }],
    });
    ownerToken = jwt.sign({ id: owner._id.toString() }, config.JWT_SECRET);
    table = await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });
    customer = await User.create({
      name: 'Diner',
      email: `table-delete-diner-${Date.now()}@test.com`,
      phone: '+15559990302',
      password_hash: 'pass',
      is_email_verified: true,
    });
  });

  const deleteTable = () =>
    request(app)
      .put(`/api/v1/cafes/${cafe._id}/tables/${table._id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ is_deleted: true });

  test.each(['HOLD', 'PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'SEATED'])(
    'rejects deleting a table with a %s reservation assigned to it',
    async (status) => {
      const reservation = await Reservation.create({
        cafe_id: cafe._id,
        user_id: customer._id,
        table_ids: [table._id],
        start_time: new Date(Date.now() + 24 * 60 * 60 * 1000),
        end_time: new Date(Date.now() + 25 * 60 * 60 * 1000),
        party_size: 2,
        reservation_timezone: 'UTC',
        status,
        hold_expires_at: status === 'HOLD' ? new Date(Date.now() + 10 * 60 * 1000) : null,
      });

      const res = await deleteTable();

      expect(res.status).toBe(422);
      const persisted = await Table.findById(table._id);
      expect(persisted.is_deleted).toBe(false);
      const persistedReservation = await Reservation.findById(reservation._id);
      expect(persistedReservation.table_ids.map((id) => id.toString())).toContain(table._id.toString());
    }
  );

  test('allows deleting a table whose only reservations are terminal (CANCELLED)', async () => {
    await Reservation.create({
      cafe_id: cafe._id,
      user_id: customer._id,
      table_ids: [table._id],
      start_time: new Date(Date.now() + 24 * 60 * 60 * 1000),
      end_time: new Date(Date.now() + 25 * 60 * 60 * 1000),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'CANCELLED',
    });

    const res = await deleteTable();

    expect(res.status).toBe(200);
    const persisted = await Table.findById(table._id);
    expect(persisted.is_deleted).toBe(true);
  });

  test('allows deleting a table with no reservations at all', async () => {
    const res = await deleteTable();

    expect(res.status).toBe(200);
  });
});
