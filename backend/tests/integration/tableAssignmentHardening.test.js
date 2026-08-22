const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const Reservation = require('../../src/models/Reservation');
const AuditLog = require('../../src/models/AuditLog');
const { setupTestDB } = require('../setup');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');

setupTestDB();

/**
 * Regression cover for the three defects found auditing the host-chosen
 * table-assignment endpoint: a double-booking race (H1), an over-eager
 * conflict window that rejected legitimate future assignments (M1), and a
 * complete absence of any audit trail for table moves (M2).
 */
describe('Table assignment hardening', () => {
  let cafe;
  let hostToken;
  let hostUser;
  let guest;

  const putTable = (reservationId, body, token = hostToken) =>
    request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservationId}/table`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const makeRes = (tableIds, status, offsetHours, partySize = 2, durationHours = 1) =>
    Reservation.create({
      cafe_id: cafe._id,
      user_id: guest._id,
      table_ids: tableIds,
      start_time: new Date(Date.now() + offsetHours * 60 * 60 * 1000),
      end_time: new Date(Date.now() + (offsetHours + durationHours) * 60 * 60 * 1000),
      party_size: partySize,
      reservation_timezone: 'UTC',
      status,
    });

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Hardening Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Hardening Cafe',
      slug: `hardening-cafe-${Date.now()}`,
      timezone: 'UTC',
      subscription_status: 'active',
    });

    hostUser = await User.create({
      name: 'Host',
      email: `host-harden-${Date.now()}@test.com`,
      phone: '+1555980001',
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [{ cafe_id: cafe._id, role: 'host', permissions: ['edit_reservations'] }],
    });
    hostToken = jwt.sign({ id: hostUser._id.toString() }, config.JWT_SECRET);

    guest = await User.create({
      name: 'Guest',
      email: `guest-harden-${Date.now()}@test.com`,
      phone: '+1555980002',
      password_hash: 'pass',
      is_email_verified: true,
    });
  });

  describe('H1: concurrent assignment must not double-book a table', () => {
    test('two reservations racing for the same table: exactly one wins', async () => {
      const table = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
      const r1 = await makeRes([], 'CONFIRMED', 1);
      const r2 = await makeRes([], 'CONFIRMED', 1);

      const results = await Promise.all([
        putTable(r1._id, { table_id: table._id.toString(), version: 0 }),
        putTable(r2._id, { table_id: table._id.toString(), version: 0 }),
      ]);

      const okCount = results.filter((r) => r.status === 200).length;
      expect(okCount).toBe(1);

      const holders = await Reservation.find({ cafe_id: cafe._id, table_ids: table._id });
      expect(holders).toHaveLength(1);
    });

    test('six reservations racing for the same table: exactly one wins', async () => {
      const table = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
      const reservations = [];
      for (let i = 0; i < 6; i++) {
        reservations.push(await makeRes([], 'CONFIRMED', 1));
      }

      const results = await Promise.all(
        reservations.map((r) => putTable(r._id, { table_id: table._id.toString(), version: 0 }))
      );

      expect(results.filter((r) => r.status === 200)).toHaveLength(1);

      const holders = await Reservation.find({ cafe_id: cafe._id, table_ids: table._id });
      expect(holders).toHaveLength(1);
    });

    test('races for DIFFERENT tables all succeed (no false serialization)', async () => {
      const t1 = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
      const t2 = await Table.create({ cafe_id: cafe._id, table_number: 'A2', capacity: 4 });
      const r1 = await makeRes([], 'CONFIRMED', 1);
      const r2 = await makeRes([], 'CONFIRMED', 1);

      const results = await Promise.all([
        putTable(r1._id, { table_id: t1._id.toString(), version: 0 }),
        putTable(r2._id, { table_id: t2._id.toString(), version: 0 }),
      ]);

      expect(results.map((r) => r.status)).toEqual([200, 200]);
    });
  });

  describe('M1: conflict window must not reject legitimate future assignments', () => {
    test('assigns a future reservation to a table booked earlier in the day (no overlap)', async () => {
      const table = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
      // Someone else holds the table 2h-3h from now (a lunch booking).
      await makeRes([table._id], 'CONFIRMED', 2);
      // Ours is 8h-9h from now — the two windows do not overlap at all.
      const reservation = await makeRes([], 'CONFIRMED', 8);

      const res = await putTable(reservation._id, { table_id: table._id.toString(), version: 0 });

      expect(res.status).toBe(200);
    });

    test('still rejects a genuinely overlapping booking', async () => {
      const table = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
      await makeRes([table._id], 'CONFIRMED', 8);
      const reservation = await makeRes([], 'CONFIRMED', 8);

      const res = await putTable(reservation._id, { table_id: table._id.toString(), version: 0 });

      expect(res.status).toBe(409);
    });

    test('a party physically SEATED elsewhere still blocks the table it occupies', async () => {
      const table = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
      // Another party is physically at the table right now, and their booked
      // window has already elapsed — only the live-occupancy check catches this.
      await makeRes([table._id], 'SEATED', -3);
      const reservation = await makeRes([], 'CONFIRMED', 8);

      const res = await putTable(reservation._id, { table_id: table._id.toString(), version: 0 });

      expect(res.status).toBe(409);
    });

    test('for a CHECKED_IN party the window widens to now (they are about to sit)', async () => {
      const table = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
      // Table is booked by someone else over the next hour.
      await makeRes([table._id], 'CONFIRMED', 0, 2);
      // Our party checked in for a slot 6h from now but is standing here now;
      // seating them at this table would collide with the current booking.
      const reservation = await makeRes([], 'CHECKED_IN', 6);

      const res = await putTable(reservation._id, { table_id: table._id.toString(), version: 0 });

      expect(res.status).toBe(409);
    });
  });

  describe('M2: table moves are recorded', () => {
    test('writes an audit log naming the staff member who moved the party', async () => {
      const from = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
      const to = await Table.create({ cafe_id: cafe._id, table_number: 'A2', capacity: 4 });
      const reservation = await makeRes([from._id], 'CONFIRMED', 8);

      const res = await putTable(reservation._id, { table_id: to._id.toString(), version: 0 });
      expect(res.status).toBe(200);

      const logs = await AuditLog.find({ cafe_id: cafe._id, action: 'ASSIGN_TABLE' });
      expect(logs).toHaveLength(1);
      expect(logs[0].performed_by.toString()).toBe(hostUser._id.toString());
      expect(logs[0].entity_id.toString()).toBe(reservation._id.toString());
      expect(logs[0].before_state.table_ids.map(String)).toEqual([from._id.toString()]);
      expect(logs[0].after_state.table_ids.map(String)).toEqual([to._id.toString()]);
    });

    test('records the move on the reservation status_history', async () => {
      const table = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
      const reservation = await makeRes([], 'CONFIRMED', 8);

      await putTable(reservation._id, { table_id: table._id.toString(), version: 0 });

      const after = await Reservation.findById(reservation._id);
      expect(after.status_history).toHaveLength(1);
      expect(after.status_history[0].status).toBe('CONFIRMED');
      expect(after.status_history[0].updated_by.toString()).toBe(hostUser._id.toString());
    });

    test('an availability conflict is tagged TABLE_UNAVAILABLE so the client can show its wording', async () => {
      const table = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
      await makeRes([table._id], 'CONFIRMED', 8);
      const reservation = await makeRes([], 'CONFIRMED', 8);

      const res = await putTable(reservation._id, { table_id: table._id.toString(), version: 0 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('TABLE_UNAVAILABLE');
      expect(res.body.error.message).toMatch(/isn't free/i);
    });

    test('a stale-version conflict is NOT tagged TABLE_UNAVAILABLE', async () => {
      const table = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
      const reservation = await makeRes([], 'CONFIRMED', 8);

      const res = await putTable(reservation._id, { table_id: table._id.toString(), version: 99 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).not.toBe('TABLE_UNAVAILABLE');
    });

    test('a rejected assignment writes no audit log', async () => {
      const small = await Table.create({ cafe_id: cafe._id, table_number: 'S1', capacity: 2 });
      const reservation = await makeRes([], 'CONFIRMED', 8, 6);

      const res = await putTable(reservation._id, { table_id: small._id.toString(), version: 0 });
      expect(res.status).toBe(422);

      const logs = await AuditLog.find({ cafe_id: cafe._id, action: 'ASSIGN_TABLE' });
      expect(logs).toHaveLength(0);
    });
  });
});
