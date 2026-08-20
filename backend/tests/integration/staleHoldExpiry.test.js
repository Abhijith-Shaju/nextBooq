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
const { expireStaleHolds } = require('../../src/services/reservationExpiryService');

setupTestDB();

describe('Integration Test: stale HOLD reservations', () => {
  let cafe;
  let hostToken;
  let table;
  let guestUser;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Stale Hold Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Stale Hold Cafe',
      slug: 'stale-hold-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });
    const hostUser = await User.create({
      name: 'Host',
      email: 'host-stalehold@test.com',
      phone: '+1555222001',
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [{ cafe_id: cafe._id, role: 'host', permissions: ['view_reservations'] }],
    });
    hostToken = jwt.sign({ id: hostUser._id.toString() }, config.JWT_SECRET);
    guestUser = await User.create({
      name: 'Guest',
      email: 'guest-stalehold@test.com',
      phone: '+1555222002',
      password_hash: 'pass',
      is_email_verified: true,
    });
    table = await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 2 });
  });

  const makeHold = (hold_expires_at) =>
    Reservation.create({
      cafe_id: cafe._id,
      user_id: guestUser._id,
      table_ids: [table._id],
      start_time: new Date('2026-09-15T19:00:00Z'),
      end_time: new Date('2026-09-15T20:30:00Z'),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'HOLD',
      hold_expires_at,
    });

  test('expireStaleHolds transitions a past-expiry HOLD to EXPIRED', async () => {
    const stale = await makeHold(new Date(Date.now() - 60 * 1000));

    const result = await expireStaleHolds();

    expect(result.expiredCount).toBe(1);
    const updated = await Reservation.findById(stale._id);
    expect(updated.status).toBe('EXPIRED');
  });

  test('expireStaleHolds leaves a HOLD with a future expiry untouched', async () => {
    const fresh = await makeHold(new Date(Date.now() + 60 * 1000));

    await expireStaleHolds();

    const updated = await Reservation.findById(fresh._id);
    expect(updated.status).toBe('HOLD');
  });

  test('the daily manifest excludes an expired-but-not-yet-swept HOLD', async () => {
    await makeHold(new Date(Date.now() - 60 * 1000));

    const res = await request(app)
      .get(`/api/v1/cafes/${cafe._id}/reservations?date=2026-09-15`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  test('the daily manifest still includes a HOLD with a future expiry', async () => {
    await makeHold(new Date(Date.now() + 60 * 1000));

    const res = await request(app)
      .get(`/api/v1/cafes/${cafe._id}/reservations?date=2026-09-15`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});
