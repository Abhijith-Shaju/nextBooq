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

// L-09: omitting `date` used to return every reservation the café has ever
// taken. It now defaults to the café's own "today" instead -- the frontend
// always passes date explicitly, so this only changes behavior for a caller
// that doesn't.
describe('Integration Test: GET manifest without a date param defaults to today, not everything', () => {
  let cafe;
  let hostToken;
  let table;
  let customer;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Manifest Default Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Manifest Default Cafe',
      slug: `manifest-default-cafe-${Date.now()}`,
      timezone: 'UTC',
      subscription_status: 'active',
    });
    table = await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });

    const host = await User.create({
      name: 'Host',
      email: `host-manifest-default-${Date.now()}@test.com`,
      phone: '+15559990701',
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [{ cafe_id: cafe._id, role: 'host', permissions: ['view_reservations'] }],
    });
    hostToken = jwt.sign({ id: host._id.toString() }, config.JWT_SECRET);

    customer = await User.create({
      name: 'Diner',
      email: `diner-manifest-default-${Date.now()}@test.com`,
      phone: '+15559990702',
      password_hash: 'pass',
      is_email_verified: true,
    });
  });

  const createReservation = (startTime) =>
    Reservation.create({
      cafe_id: cafe._id,
      user_id: customer._id,
      table_ids: [table._id],
      start_time: startTime,
      end_time: new Date(startTime.getTime() + 60 * 60 * 1000),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'CONFIRMED',
    });

  test('omitting date returns only today\'s reservations, not a reservation from last month', async () => {
    const now = new Date();
    const todayNoon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
    const today = await createReservation(todayNoon);

    const lastMonth = new Date(todayNoon);
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    await createReservation(lastMonth);

    const res = await request(app)
      .get(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((r) => r._id);
    expect(ids).toContain(today._id.toString());
    expect(ids).toHaveLength(1);
  });
});
