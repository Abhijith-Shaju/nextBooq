const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const Reservation = require('../../src/models/Reservation');
const CafeCustomer = require('../../src/models/CafeCustomer');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Integration Test: CafeCustomer visit/no-show counters', () => {
  let cafe;
  let hostToken;
  let table;

  const makeConfirmedReservation = async (guestUser) =>
    Reservation.create({
      cafe_id: cafe._id,
      user_id: guestUser._id,
      table_ids: [table._id],
      start_time: new Date('2026-09-05T19:00:00Z'),
      end_time: new Date('2026-09-05T20:30:00Z'),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'CONFIRMED',
    });

  const putStatus = (reservationId, status, version) =>
    request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservationId}/status`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ status, version });

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Counters Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Counters Cafe',
      slug: 'counters-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });

    const hostUser = await User.create({
      name: 'Host',
      email: 'host-counters@test.com',
      phone: '+1555777001',
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [
        {
          cafe_id: cafe._id,
          role: 'host',
          permissions: ['edit_reservations', 'cancel_reservations'],
        },
      ],
    });
    hostToken = jwt.sign({ id: hostUser._id.toString() }, config.JWT_SECRET);

    table = await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });
  });

  test('completing a reservation increments total_visits (creating the rolodex record if missing)', async () => {
    const guest = await User.create({
      name: 'Guest Visits',
      email: 'guest-visits@test.com',
      phone: '+1555888001',
      password_hash: 'pass',
      is_email_verified: true,
    });
    const reservation = await makeConfirmedReservation(guest);

    const seatRes = await putStatus(reservation._id, 'SEATED', 0);
    expect(seatRes.status).toBe(200);

    const completeRes = await putStatus(reservation._id, 'COMPLETED', 1);
    expect(completeRes.status).toBe(200);

    const customerRecord = await CafeCustomer.findOne({ cafe_id: cafe._id, user_id: guest._id });
    expect(customerRecord).not.toBeNull();
    expect(customerRecord.total_visits).toBe(1);
    expect(customerRecord.total_no_shows).toBe(0);
  });

  test('marking a reservation NO_SHOW increments total_no_shows', async () => {
    const guest = await User.create({
      name: 'Guest NoShow',
      email: 'guest-noshow@test.com',
      phone: '+1555888002',
      password_hash: 'pass',
      is_email_verified: true,
    });
    const reservation = await makeConfirmedReservation(guest);

    const res = await putStatus(reservation._id, 'NO_SHOW', 0);
    expect(res.status).toBe(200);

    const customerRecord = await CafeCustomer.findOne({ cafe_id: cafe._id, user_id: guest._id });
    expect(customerRecord).not.toBeNull();
    expect(customerRecord.total_no_shows).toBe(1);
    expect(customerRecord.total_visits).toBe(0);
  });

  test('a second completed visit increments the existing record rather than resetting it', async () => {
    const guest = await User.create({
      name: 'Guest Repeat',
      email: 'guest-repeat@test.com',
      phone: '+1555888003',
      password_hash: 'pass',
      is_email_verified: true,
    });
    await CafeCustomer.create({ cafe_id: cafe._id, user_id: guest._id, total_visits: 3, total_no_shows: 1 });

    const reservation = await makeConfirmedReservation(guest);
    await putStatus(reservation._id, 'SEATED', 0);
    await putStatus(reservation._id, 'COMPLETED', 1);

    const customerRecord = await CafeCustomer.findOne({ cafe_id: cafe._id, user_id: guest._id });
    expect(customerRecord.total_visits).toBe(4);
    expect(customerRecord.total_no_shows).toBe(1);
  });
});
