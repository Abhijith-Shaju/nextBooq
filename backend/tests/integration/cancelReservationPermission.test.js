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

describe('Integration Test: cancel_reservations permission is enforced separately from edit_reservations', () => {
  let cafe;
  let table;

  const makeStaff = async (email, permissions) => {
    const user = await User.create({
      name: 'Staff ' + email,
      email,
      phone: '+1555' + Math.floor(Math.random() * 1000000),
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [{ cafe_id: cafe._id, role: 'staff', permissions }],
    });
    return jwt.sign({ id: user._id.toString() }, config.JWT_SECRET);
  };

  const makeConfirmedReservation = async () => {
    const user = await User.create({
      name: 'Guest',
      email: `guest-${Date.now()}-${Math.random()}@test.com`,
      phone: '+1444' + Math.floor(Math.random() * 1000000),
      password_hash: 'pass',
      is_email_verified: true,
    });
    return Reservation.create({
      cafe_id: cafe._id,
      user_id: user._id,
      table_ids: [table._id],
      start_time: new Date('2026-08-20T19:00:00Z'),
      end_time: new Date('2026-08-20T20:30:00Z'),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'CONFIRMED',
    });
  };

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Cancel Perm Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Cancel Perm Cafe',
      slug: 'cancel-perm-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });
    table = await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 2 });
  });

  test('staff with only edit_reservations cannot CANCEL', async () => {
    const token = await makeStaff('edit-only@test.com', ['edit_reservations']);
    const reservation = await makeConfirmedReservation();

    const res = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CANCELLED', version: reservation.__v });

    expect(res.status).toBe(403);
  });

  test('staff with only cancel_reservations CAN cancel', async () => {
    const token = await makeStaff('cancel-only@test.com', ['cancel_reservations']);
    const reservation = await makeConfirmedReservation();

    const res = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CANCELLED', version: reservation.__v });

    expect(res.status).toBe(200);
  });

  test('staff with only cancel_reservations cannot perform a non-cancel transition', async () => {
    const token = await makeStaff('cancel-only-2@test.com', ['cancel_reservations']);
    const reservation = await makeConfirmedReservation();

    const res = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CHECKED_IN', version: reservation.__v });

    expect(res.status).toBe(403);
  });

  test('staff with edit_reservations can still perform a non-cancel transition', async () => {
    const token = await makeStaff('edit-only-2@test.com', ['edit_reservations']);
    const reservation = await makeConfirmedReservation();

    const res = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CHECKED_IN', version: reservation.__v });

    expect(res.status).toBe(200);
  });
});
