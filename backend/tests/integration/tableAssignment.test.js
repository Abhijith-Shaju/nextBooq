const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const Reservation = require('../../src/models/Reservation');
const { setupTestDB } = require('../setup');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');

setupTestDB();

describe('PUT /cafes/:cafeId/reservations/:resId/table — host-chosen table assignment', () => {
  let cafe;
  let hostToken;
  let guest;

  const putTable = (reservationId, body) =>
    request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservationId}/table`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send(body);

  const makeRes = (tableIds, status, offsetHours, partySize = 2) =>
    Reservation.create({
      cafe_id: cafe._id,
      user_id: guest._id,
      table_ids: tableIds,
      start_time: new Date(Date.now() + offsetHours * 60 * 60 * 1000),
      end_time: new Date(Date.now() + (offsetHours + 1) * 60 * 60 * 1000),
      party_size: partySize,
      reservation_timezone: 'UTC',
      status,
    });

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Assignment Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Assignment Cafe',
      slug: `assignment-cafe-${Date.now()}`,
      timezone: 'UTC',
      subscription_status: 'active',
    });

    const hostUser = await User.create({
      name: 'Host',
      email: `host-assign-${Date.now()}@test.com`,
      phone: '+1555960001',
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [{ cafe_id: cafe._id, role: 'host', permissions: ['edit_reservations'] }],
    });
    hostToken = jwt.sign({ id: hostUser._id.toString() }, config.JWT_SECRET);

    guest = await User.create({
      name: 'Guest',
      email: `guest-assign-${Date.now()}@test.com`,
      phone: '+1555960002',
      password_hash: 'pass',
      is_email_verified: true,
    });
  });

  test('assigns an unassigned CONFIRMED reservation to a free table', async () => {
    const table = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
    const reservation = await makeRes([], 'CONFIRMED', 1);

    const res = await putTable(reservation._id, { table_id: table._id.toString(), version: 0 });

    expect(res.status).toBe(200);
    expect(res.body.data.table_ids.map((t) => (t._id || t).toString())).toEqual([table._id.toString()]);

    const updated = await Reservation.findById(reservation._id);
    expect(updated.table_ids.map((id) => id.toString())).toEqual([table._id.toString()]);
    expect(updated.__v).toBe(1);
  });

  test('moves a reservation already seated at one table to a different free table', async () => {
    const tableA = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
    const tableB = await Table.create({ cafe_id: cafe._id, table_number: 'B1', capacity: 4 });
    const reservation = await makeRes([tableA._id], 'SEATED', -1);

    const res = await putTable(reservation._id, { table_id: tableB._id.toString(), version: 0 });

    expect(res.status).toBe(200);
    const updated = await Reservation.findById(reservation._id);
    expect(updated.table_ids.map((id) => id.toString())).toEqual([tableB._id.toString()]);
  });

  test('rejects a table too small for the party size', async () => {
    const smallTable = await Table.create({ cafe_id: cafe._id, table_number: 'S1', capacity: 2 });
    const reservation = await makeRes([], 'CONFIRMED', 1, 4);

    const res = await putTable(reservation._id, { table_id: smallTable._id.toString(), version: 0 });

    expect(res.status).toBe(422);
    const unchanged = await Reservation.findById(reservation._id);
    expect(unchanged.table_ids).toEqual([]);
  });

  test('rejects a table that is out of service', async () => {
    const table = await Table.create({
      cafe_id: cafe._id,
      table_number: 'X1',
      capacity: 4,
      status: 'out_of_service',
    });
    const reservation = await makeRes([], 'CONFIRMED', 1);

    const res = await putTable(reservation._id, { table_id: table._id.toString(), version: 0 });

    expect(res.status).toBe(400);
  });

  test('rejects a table already SEATED with another party right now', async () => {
    const table = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
    await makeRes([table._id], 'SEATED', -1);
    const reservation = await makeRes([], 'CONFIRMED', 1);

    const res = await putTable(reservation._id, { table_id: table._id.toString(), version: 0 });

    expect(res.status).toBe(409);
    const unchanged = await Reservation.findById(reservation._id);
    expect(unchanged.table_ids).toEqual([]);
  });

  test('rejects a table already booked for an overlapping window', async () => {
    const table = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
    await makeRes([table._id], 'CONFIRMED', 1); // booked 1-2h from now
    const reservation = await makeRes([], 'CONFIRMED', 1); // also 1-2h from now — overlaps

    const res = await putTable(reservation._id, { table_id: table._id.toString(), version: 0 });

    expect(res.status).toBe(409);
  });

  test('allows assigning a table whose only prior booking has ended (no real overlap)', async () => {
    const table = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
    await makeRes([table._id], 'COMPLETED', -5);
    const reservation = await makeRes([], 'CONFIRMED', 1);

    const res = await putTable(reservation._id, { table_id: table._id.toString(), version: 0 });

    expect(res.status).toBe(200);
  });

  test('rejects assignment for a reservation still in HOLD', async () => {
    const table = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
    const reservation = await makeRes([], 'HOLD', 1);

    const res = await putTable(reservation._id, { table_id: table._id.toString(), version: 0 });

    expect(res.status).toBe(422);
  });

  test('rejects assignment for a terminal reservation (CANCELLED)', async () => {
    const table = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
    const reservation = await makeRes([], 'CANCELLED', 1);

    const res = await putTable(reservation._id, { table_id: table._id.toString(), version: 0 });

    expect(res.status).toBe(422);
  });

  test('rejects a stale OCC version', async () => {
    const table = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
    const reservation = await makeRes([], 'CONFIRMED', 1);

    const res = await putTable(reservation._id, { table_id: table._id.toString(), version: 5 });

    expect(res.status).toBe(409);
  });

  test('404s for a table belonging to a different cafe', async () => {
    const otherOrg = await Organization.create({ name: 'Other Assignment Org' });
    const otherCafe = await Cafe.create({
      org_id: otherOrg._id,
      name: 'Other Cafe',
      slug: `other-assignment-cafe-${Date.now()}`,
      timezone: 'UTC',
    });
    const foreignTable = await Table.create({ cafe_id: otherCafe._id, table_number: 'A1', capacity: 4 });
    const reservation = await makeRes([], 'CONFIRMED', 1);

    const res = await putTable(reservation._id, { table_id: foreignTable._id.toString(), version: 0 });

    expect(res.status).toBe(404);
  });

  test('requires table_id and version', async () => {
    const reservation = await makeRes([], 'CONFIRMED', 1);

    const res = await putTable(reservation._id, {});

    expect(res.status).toBe(400);
  });

  test('a staff member without edit_reservations gets 403', async () => {
    const table = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
    const reservation = await makeRes([], 'CONFIRMED', 1);
    const limitedUser = await User.create({
      name: 'Limited Staff',
      email: `limited-assign-${Date.now()}@test.com`,
      phone: '+1555960003',
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [{ cafe_id: cafe._id, role: 'staff', permissions: ['view_reservations'] }],
    });
    const limitedToken = jwt.sign({ id: limitedUser._id.toString() }, config.JWT_SECRET);

    const res = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/table`)
      .set('Authorization', `Bearer ${limitedToken}`)
      .send({ table_id: table._id.toString(), version: 0 });

    expect(res.status).toBe(403);
  });
});
