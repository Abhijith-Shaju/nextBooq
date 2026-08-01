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

describe('Integration Test: Optimistic Concurrency Control (OCC) Version Conflict', () => {
  let cafe;
  let hostToken;
  let hostUser;
  let reservation;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'OCC Test Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'OCC Cafe',
      slug: 'occ-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });

    hostUser = await User.create({
      name: 'Host User',
      email: 'host@occ.com',
      phone: '+1987654321',
      password_hash: 'hashed',
      staff_memberships: [
        {
          cafe_id: cafe._id,
          role: 'host',
          permissions: ['view_reservations', 'edit_reservations'],
        },
      ],
    });
    hostToken = jwt.sign({ id: hostUser._id.toString() }, config.JWT_SECRET);

    const table = await Table.create({
      cafe_id: cafe._id,
      table_number: 'T1',
      capacity: 4,
    });

    reservation = await Reservation.create({
      cafe_id: cafe._id,
      user_id: hostUser._id,
      table_ids: [table._id],
      start_time: new Date('2026-08-15T19:00:00Z'),
      end_time: new Date('2026-08-15T20:30:00Z'),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'CONFIRMED',
      __v: 0,
    });
  });

  test('simultaneous updates passing version 0: first succeeds (v=1), second fails with 409 Conflict', async () => {
    const currentVersion = reservation.__v; // 0

    // Fire 2 concurrent PUT status update requests passing expected version = 0
    const [res1, res2] = await Promise.all([
      request(app)
        .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/status`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ status: 'CHECKED_IN', version: currentVersion }),
      request(app)
        .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/status`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ status: 'CANCELLED', version: currentVersion }),
    ]);

    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);

    const successfulRes = res1.status === 200 ? res1 : res2;
    const failedRes = res1.status === 409 ? res1 : res2;

    expect(successfulRes.body.data.__v).toBe(1);
    expect(failedRes.body.statusCode).toBe(409);
    expect(failedRes.body.message).toMatch(/OCC Conflict/i);

    // Verify DB reservation version is incremented to 1
    const updatedDbRes = await Reservation.findById(reservation._id);
    expect(updatedDbRes.__v).toBe(1);
  });
});
