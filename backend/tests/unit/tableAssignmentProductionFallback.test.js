const mongoose = require('mongoose');
const { setupTestDB } = require('../setup');
const config = require('../../src/config/env');
const { assignReservationToTable } = require('../../src/services/tableAssignmentService');
const Organization = require('../../src/models/Organization');
const Cafe = require('../../src/models/Cafe');
const Table = require('../../src/models/Table');
const User = require('../../src/models/User');
const Reservation = require('../../src/models/Reservation');

setupTestDB();

// The mirror of bookingServiceProductionFallback.test.js, for the copy of the
// same heuristic that lived in tableAssignmentService without the guard.
//
// config/database.js's connectDB() asserts transaction support at boot in
// production, so any "replica set" error reaching this code in production is
// necessarily transient -- an election or stepdown -- not a genuine lack of
// support. Re-running performAssignment without a session on that signal
// abandons the write-conflict serialization that makes two hosts assigning
// the same table collide, so two parties could be sent to one table during
// exactly the window when the cluster is already unhealthy.
describe('assignReservationToTable refuses the non-transactional fallback in production', () => {
  let cafe;
  let table;
  let otherTable;
  let reservation;
  let host;
  const replicaSetError = () =>
    new Error('Transaction numbers are only allowed on a replica set member or mongos');

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Assign Fallback Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Assign Fallback Cafe',
      slug: `assign-fallback-${Date.now()}`,
      timezone: 'UTC',
      subscription_status: 'active',
    });
    table = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
    otherTable = await Table.create({ cafe_id: cafe._id, table_number: 'A2', capacity: 4 });
    host = await User.create({
      name: 'Assign Fallback Host',
      email: `assign-fallback-${Date.now()}@test.com`,
      phone: `+1555${String(Date.now()).slice(-7)}`,
      password_hash: 'pass',
      is_email_verified: true,
    });
    reservation = await Reservation.create({
      cafe_id: cafe._id,
      user_id: host._id,
      table_ids: [otherTable._id],
      start_time: new Date(Date.now() + 4 * 60 * 60 * 1000),
      end_time: new Date(Date.now() + 5 * 60 * 60 * 1000),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'CONFIRMED',
    });
  });

  const buildArgs = () => ({
    reservationId: reservation._id,
    tenantId: cafe._id,
    tableId: table._id,
    expectedVersion: reservation.__v,
    updatedByUserId: host._id,
  });

  test('propagates the error instead of silently falling back, when NODE_ENV is production', async () => {
    const originalNodeEnv = config.NODE_ENV;
    const originalStartSession = mongoose.startSession;
    config.NODE_ENV = 'production';
    mongoose.startSession = jest.fn().mockRejectedValueOnce(replicaSetError());

    try {
      await expect(assignReservationToTable(buildArgs())).rejects.toThrow(
        /replica set member or mongos/
      );
    } finally {
      config.NODE_ENV = originalNodeEnv;
      mongoose.startSession = originalStartSession;
    }

    // The assignment must not have landed.
    const unchanged = await Reservation.findById(reservation._id);
    expect(unchanged.table_ids.map(String)).toEqual([otherTable._id.toString()]);
  });

  test('still falls back to the non-transactional path outside production on the same error', async () => {
    // Jest sets NODE_ENV to 'test' by default -- confirm we are actually
    // exercising the "not production" branch, and not still production from
    // a prior test that failed to restore it.
    expect(config.NODE_ENV).not.toBe('production');

    const originalStartSession = mongoose.startSession;
    mongoose.startSession = jest.fn().mockRejectedValueOnce(replicaSetError());

    let result;
    try {
      result = await assignReservationToTable(buildArgs());
    } finally {
      mongoose.startSession = originalStartSession;
    }

    expect(result.table_ids.map((t) => t._id.toString())).toEqual([table._id.toString()]);
  });
});
