const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const { setupTestDB } = require('../setup');
const { nextWeekday } = require('../helpers/dates');

setupTestDB();

describe('Integration Test: available-slots reflects cafe operating hours', () => {
  let cafe;
  let customerToken;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Hours Slots Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Hours Slots Cafe',
      slug: `hours-slots-cafe-${Date.now()}`,
      timezone: 'UTC',
      subscription_status: 'active',
      operating_hours: [
        { day_of_week: 'monday', open_time: '07:00', close_time: '23:30', is_closed: false },
        { day_of_week: 'tuesday', open_time: '10:00', close_time: '14:00', is_closed: false },
        { day_of_week: 'sunday', open_time: '00:00', close_time: '00:00', is_closed: true },
      ],
    });

    await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });

    const customer = await User.create({
      name: 'Guest',
      email: `guest-hours-${Date.now()}@test.com`,
      phone: '+1555700001',
      password_hash: 'pass',
      is_email_verified: true,
    });
    customerToken = jwt.sign({ id: customer._id.toString() }, config.JWT_SECRET);
  });

  test('offers slots outside the old 09:00-22:00 default when the cafe is open later/earlier', async () => {
    // Monday open 07:00-23:30 -- previously slots before 09:00 or after 22:00 never appeared at all.
    const res = await request(app)
      .get(`/api/v1/cafes/${cafe._id}/available-slots`)
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ date: nextWeekday('monday'), partySize: 2, durationMinutes: 60 });

    expect(res.status).toBe(200);
    const times = res.body.data.map((s) => s.time);
    expect(times).toContain('07:00');
    expect(times).toContain('22:30'); // last slot whose 60-min duration still fits before 23:30 close
    expect(times).not.toContain('06:30');
    expect(times).not.toContain('23:00');
    expect(times).not.toContain('23:30');
  });

  test('does not offer slots outside a narrower configured window', async () => {
    // Tuesday open 10:00-14:00 only
    const res = await request(app)
      .get(`/api/v1/cafes/${cafe._id}/available-slots`)
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ date: nextWeekday('tuesday'), partySize: 2, durationMinutes: 60 });

    expect(res.status).toBe(200);
    const times = res.body.data.map((s) => s.time);
    expect(times).toContain('10:00');
    expect(times).toContain('13:00');
    expect(times).not.toContain('09:30');
    expect(times).not.toContain('14:00');
    expect(times.every((t) => res.body.data.find((s) => s.time === t).available)).toBe(true);
  });

  test('returns an empty slot list for a day the cafe is fully closed', async () => {
    const res = await request(app)
      .get(`/api/v1/cafes/${cafe._id}/available-slots`)
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ date: nextWeekday('sunday'), partySize: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('single time-slot check (?time=) honors the extended hours too', async () => {
    const res = await request(app)
      .get(`/api/v1/cafes/${cafe._id}/available-slots`)
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ date: nextWeekday('monday'), time: '22:45', partySize: 2, durationMinutes: 30 });

    expect(res.status).toBe(200);
    expect(res.body.data.available).toBe(true);
  });
});
