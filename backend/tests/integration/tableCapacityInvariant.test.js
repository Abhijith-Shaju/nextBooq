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

describe('Integration Test: table capacity reduction is validated against active reservations', () => {
  let cafe;
  let ownerToken;
  let table;
  let guestUser;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Capacity Test Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Capacity Cafe',
      slug: 'capacity-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });

    const ownerUser = await User.create({
      name: 'Owner',
      email: 'owner-capacity@test.com',
      phone: '+1555111222',
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [{ cafe_id: cafe._id, role: 'owner', permissions: [] }],
    });
    ownerToken = jwt.sign({ id: ownerUser._id.toString() }, config.JWT_SECRET);

    guestUser = await User.create({
      name: 'Guest',
      email: 'guest-capacity@test.com',
      phone: '+1555333444',
      password_hash: 'pass',
      is_email_verified: true,
    });

    table = await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 8 });
  });

  test('rejects reducing capacity below an active reservation party_size relying on it', async () => {
    await Reservation.create({
      cafe_id: cafe._id,
      user_id: guestUser._id,
      table_ids: [table._id],
      start_time: new Date('2026-09-01T19:00:00Z'),
      end_time: new Date('2026-09-01T20:30:00Z'),
      party_size: 6,
      reservation_timezone: 'UTC',
      status: 'CONFIRMED',
    });

    const res = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/tables/${table._id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ capacity: 4 });

    expect(res.status).toBe(422);

    const unchanged = await Table.findById(table._id);
    expect(unchanged.capacity).toBe(8);
  });

  test('allows reducing capacity when it still covers active reservations', async () => {
    await Reservation.create({
      cafe_id: cafe._id,
      user_id: guestUser._id,
      table_ids: [table._id],
      start_time: new Date('2026-09-01T19:00:00Z'),
      end_time: new Date('2026-09-01T20:30:00Z'),
      party_size: 4,
      reservation_timezone: 'UTC',
      status: 'CONFIRMED',
    });

    const res = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/tables/${table._id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ capacity: 4 });

    expect(res.status).toBe(200);
  });

  test('ignores cancelled/completed reservations when validating a capacity reduction', async () => {
    await Reservation.create({
      cafe_id: cafe._id,
      user_id: guestUser._id,
      table_ids: [table._id],
      start_time: new Date('2026-09-01T19:00:00Z'),
      end_time: new Date('2026-09-01T20:30:00Z'),
      party_size: 6,
      reservation_timezone: 'UTC',
      status: 'CANCELLED',
    });

    const res = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/tables/${table._id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ capacity: 2 });

    expect(res.status).toBe(200);
  });

  test('accounts for merged-partner table capacity when validating a reduction', async () => {
    const partner = await Table.create({ cafe_id: cafe._id, table_number: 'T2', capacity: 4 });
    await Table.updateOne({ _id: table._id }, { $set: { can_merge_with: [partner._id] } });
    await Table.updateOne({ _id: partner._id }, { $set: { can_merge_with: [table._id] } });

    await Reservation.create({
      cafe_id: cafe._id,
      user_id: guestUser._id,
      table_ids: [table._id, partner._id],
      start_time: new Date('2026-09-01T19:00:00Z'),
      end_time: new Date('2026-09-01T20:30:00Z'),
      party_size: 10, // fits 8 (table) + 4 (partner) today, would not fit 4 + 4
      reservation_timezone: 'UTC',
      status: 'CONFIRMED',
    });

    const res = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/tables/${table._id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ capacity: 4 });

    expect(res.status).toBe(422);
  });
});
