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

// M-03: the manifest used to window by UTC midnight-to-midnight regardless
// of the cafe's own timezone. For an IST cafe (+5:30), that split every
// evening service across two calendar-day pages and could pull the tail of
// the previous night's late reservations into "today".
describe('Integration Test: daily manifest resolves the day window in the cafe\'s own timezone', () => {
  let cafe;
  let hostToken;
  let customer;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Manifest TZ Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Manifest TZ Cafe',
      slug: `manifest-tz-cafe-${Date.now()}`,
      timezone: 'Asia/Kolkata', // UTC+5:30
      subscription_status: 'active',
    });
    await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });

    const host = await User.create({
      name: 'Host',
      email: `host-manifest-tz-${Date.now()}@test.com`,
      phone: '+15559990101',
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [{ cafe_id: cafe._id, role: 'host', permissions: ['view_reservations'] }],
    });
    hostToken = jwt.sign({ id: host._id.toString() }, config.JWT_SECRET);

    customer = await User.create({
      name: 'Diner',
      email: `diner-manifest-tz-${Date.now()}@test.com`,
      phone: '+15559990102',
      password_hash: 'pass',
      is_email_verified: true,
    });
  });

  const createReservation = async (startTimeUTC) => {
    const table = await Table.findOne({ cafe_id: cafe._id });
    return Reservation.create({
      cafe_id: cafe._id,
      user_id: customer._id,
      table_ids: [table._id],
      start_time: startTimeUTC,
      end_time: new Date(startTimeUTC.getTime() + 60 * 60 * 1000),
      party_size: 2,
      reservation_timezone: cafe.timezone,
      status: 'CONFIRMED',
    });
  };

  const getManifest = (date) =>
    request(app)
      .get(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${hostToken}`)
      .query(date ? { date } : {});

  test('a reservation just after IST midnight belongs to the next calendar day, not the UTC one', async () => {
    // 2026-09-04T19:00:00Z = 2026-09-05T00:30 IST -- already tomorrow in
    // the cafe's own timezone, even though it's still 2026-09-04 in UTC.
    const reservation = await createReservation(new Date('2026-09-04T19:00:00.000Z'));

    const sept4 = await getManifest('2026-09-04');
    expect(sept4.status).toBe(200);
    expect(sept4.body.data.map((r) => r._id)).not.toContain(reservation._id.toString());

    const sept5 = await getManifest('2026-09-05');
    expect(sept5.status).toBe(200);
    expect(sept5.body.data.map((r) => r._id)).toContain(reservation._id.toString());
  });

  test('a reservation squarely within the IST day still appears on that day', async () => {
    // 2026-09-04T10:00:00Z = 2026-09-04T15:30 IST -- same calendar day
    // either way, sanity-checking the boundary fix didn't break the normal case.
    const reservation = await createReservation(new Date('2026-09-04T10:00:00.000Z'));

    const sept4 = await getManifest('2026-09-04');
    expect(sept4.body.data.map((r) => r._id)).toContain(reservation._id.toString());
  });

  test('rejects a malformed date instead of silently returning nothing', async () => {
    const res = await getManifest('not-a-date');
    expect(res.status).toBe(400);
  });
});
