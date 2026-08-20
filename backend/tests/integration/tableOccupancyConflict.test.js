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

describe('Integration Test: seating a reservation warns (but does not block) on table occupancy conflicts', () => {
  let cafe;
  let hostToken;
  let table;
  let guestA;
  let guestB;

  const putStatus = (reservationId, body) =>
    request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservationId}/status`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send(body);

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Occupancy Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Occupancy Cafe',
      slug: 'occupancy-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });

    const hostUser = await User.create({
      name: 'Host',
      email: 'host-occupancy@test.com',
      phone: '+1555900001',
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [
        { cafe_id: cafe._id, role: 'host', permissions: ['edit_reservations', 'cancel_reservations'] },
      ],
    });
    hostToken = jwt.sign({ id: hostUser._id.toString() }, config.JWT_SECRET);

    table = await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });

    guestA = await User.create({
      name: 'Guest A',
      email: 'guest-a-occ@test.com',
      phone: '+1555900002',
      password_hash: 'pass',
      is_email_verified: true,
    });
    guestB = await User.create({
      name: 'Guest B',
      email: 'guest-b-occ@test.com',
      phone: '+1555900003',
      password_hash: 'pass',
      is_email_verified: true,
    });
  });

  const makeReservation = (guest, status, timeOffsetHours = 0) =>
    Reservation.create({
      cafe_id: cafe._id,
      user_id: guest._id,
      table_ids: [table._id],
      start_time: new Date(Date.now() + timeOffsetHours * 60 * 60 * 1000),
      end_time: new Date(Date.now() + (timeOffsetHours + 1) * 60 * 60 * 1000),
      party_size: 2,
      reservation_timezone: 'UTC',
      status,
    });

  test('seating a reservation on a table another party is currently SEATED at returns a 409 conflict, without seating it', async () => {
    await makeReservation(guestA, 'SEATED', -1);
    const resB = await makeReservation(guestB, 'CONFIRMED', 2);

    const res = await putStatus(resB._id, { status: 'SEATED', version: 0 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TABLE_OCCUPIED');
    expect(res.body.conflict.guestName).toBe('Guest A');
    expect(res.body.conflict.tableNumbers).toEqual(['T1']);

    const stillConfirmed = await Reservation.findById(resB._id);
    expect(stillConfirmed.status).toBe('CONFIRMED');
  });

  test('passing force:true seats the reservation anyway despite the conflict', async () => {
    await makeReservation(guestA, 'SEATED', -1);
    const resB = await makeReservation(guestB, 'CONFIRMED', 2);

    const res = await putStatus(resB._id, { status: 'SEATED', version: 0, force: true });

    expect(res.status).toBe(200);
    const updated = await Reservation.findById(resB._id);
    expect(updated.status).toBe('SEATED');
  });

  test('seating is unaffected when the other reservation on the table is only CHECKED_IN, not SEATED', async () => {
    await makeReservation(guestA, 'CHECKED_IN', -1);
    const resB = await makeReservation(guestB, 'CONFIRMED', 2);

    const res = await putStatus(resB._id, { status: 'SEATED', version: 0 });

    expect(res.status).toBe(200);
  });

  test('seating is unaffected when no other reservation occupies the table', async () => {
    const resB = await makeReservation(guestB, 'CONFIRMED', 2);

    const res = await putStatus(resB._id, { status: 'SEATED', version: 0 });

    expect(res.status).toBe(200);
  });

  test('seating a reservation whose merged tables overlap a seated reservation on only one shared table still conflicts', async () => {
    const partnerTable = await Table.create({ cafe_id: cafe._id, table_number: 'T2', capacity: 2 });

    await Reservation.create({
      cafe_id: cafe._id,
      user_id: guestA._id,
      table_ids: [partnerTable._id],
      start_time: new Date(Date.now() - 60 * 60 * 1000),
      end_time: new Date(Date.now() + 60 * 60 * 1000),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'SEATED',
    });

    const resB = await Reservation.create({
      cafe_id: cafe._id,
      user_id: guestB._id,
      table_ids: [table._id, partnerTable._id],
      start_time: new Date(Date.now() + 2 * 60 * 60 * 1000),
      end_time: new Date(Date.now() + 3 * 60 * 60 * 1000),
      party_size: 6,
      reservation_timezone: 'UTC',
      status: 'CONFIRMED',
    });

    const res = await putStatus(resB._id, { status: 'SEATED', version: 0 });

    expect(res.status).toBe(409);
    expect(res.body.conflict.tableNumbers).toEqual(['T2']);
  });

  test('other status transitions (e.g. CHECKED_IN) are not affected by the occupancy check', async () => {
    await makeReservation(guestA, 'SEATED', -1);
    const resB = await makeReservation(guestB, 'CONFIRMED', 2);

    const res = await putStatus(resB._id, { status: 'CHECKED_IN', version: 0 });

    expect(res.status).toBe(200);
  });
});
