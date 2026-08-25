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

// L-04: GET /available-slots previously called allocateTables() once per
// candidate slot, each call re-querying reservations and tables from
// scratch -- 52+ round trips for a 13-hour day at a 30-min turn time, from a
// single unauthenticated request. It now fetches tables and reservations
// once for the whole day and evaluates every slot in memory.
describe('Integration Test: available-slots batches its DB queries across all candidate slots', () => {
  let cafe;
  let customerToken;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Batched Slots Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Batched Slots Cafe',
      slug: `batched-slots-cafe-${Date.now()}`,
      timezone: 'UTC',
      subscription_status: 'active',
      operating_hours: [
        { day_of_week: 'monday', open_time: '09:00', close_time: '22:00', is_closed: false },
      ],
    });

    await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });

    const customer = await User.create({
      name: 'Guest',
      email: `guest-batched-${Date.now()}@test.com`,
      phone: '+1555700002',
      password_hash: 'pass',
      is_email_verified: true,
    });
    customerToken = jwt.sign({ id: customer._id.toString() }, config.JWT_SECRET);
  });

  test('issues a constant number of queries regardless of how many candidate slots the day has', async () => {
    const tableFindSpy = jest.spyOn(Table, 'find');
    const reservationFindSpy = jest.spyOn(Reservation, 'find');

    // 09:00-22:00 at a 30-min turn time is 26 candidate slots -- a per-slot
    // query strategy would issue 52 queries here (26 Table.find + 26
    // Reservation.find) rather than one pair.
    const res = await request(app)
      .get(`/api/v1/cafes/${cafe._id}/available-slots`)
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ date: '2026-08-31', partySize: 2, durationMinutes: 30 }); // a Monday

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(10);

    expect(tableFindSpy).toHaveBeenCalledTimes(1);
    expect(reservationFindSpy).toHaveBeenCalledTimes(1);

    tableFindSpy.mockRestore();
    reservationFindSpy.mockRestore();
  });

  test('still correctly marks a slot unavailable when a table-blocking reservation only overlaps that slot', async () => {
    // Confirms the in-memory batched path produces the same per-slot
    // decision as the old per-slot DB path, not just fewer queries.
    const blockerUser = await User.create({
      name: 'Blocker',
      email: `blocker-batched-${Date.now()}@test.com`,
      phone: '+1555700003',
      password_hash: 'pass',
      is_email_verified: true,
    });

    await Reservation.create({
      cafe_id: cafe._id,
      user_id: blockerUser._id,
      table_ids: [(await Table.findOne({ cafe_id: cafe._id }))._id],
      status: 'CONFIRMED',
      party_size: 2,
      start_time: new Date('2026-08-31T12:00:00.000Z'),
      end_time: new Date('2026-08-31T12:30:00.000Z'),
      reservation_timezone: 'UTC',
    });

    const res = await request(app)
      .get(`/api/v1/cafes/${cafe._id}/available-slots`)
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ date: '2026-08-31', partySize: 2, durationMinutes: 30 });

    expect(res.status).toBe(200);
    const bySlot = Object.fromEntries(res.body.data.map((s) => [s.time, s.available]));
    expect(bySlot['12:00']).toBe(false);
    expect(bySlot['11:30']).toBe(true);
    expect(bySlot['12:30']).toBe(true);
  });
});
