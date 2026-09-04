const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');
const { encrypt } = require('../../src/utils/encryption');

setupTestDB();

describe('Integration Test: updating cafe operating hours', () => {
  let cafe;
  let ownerToken;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Hours Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Hours Cafe',
      slug: 'hours-cafe',
      timezone: 'UTC',
      contact_phone: '+911234567890',
      address: { line1: '1 Test Street', city: 'Kochi', state: 'Kerala', postal_code: '682001' },
      subscription_status: 'active',
      payments: {
        razorpay_key_id: 'rzp_test_fixture',
        razorpay_key_secret_encrypted: encrypt('fixture_key_secret'),
        razorpay_webhook_secret_encrypted: encrypt('fixture_webhook_secret'),
        configured: true,
      },
    });
    const owner = await User.create({
      name: 'Owner',
      email: 'owner-hours@test.com',
      phone: '+1555800001',
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [{ cafe_id: cafe._id, role: 'owner', permissions: [] }],
    });
    ownerToken = jwt.sign({ id: owner._id.toString() }, config.JWT_SECRET);
  });

  const putSettings = (body) =>
    request(app).put(`/api/v1/cafes/${cafe._id}`).set('Authorization', `Bearer ${ownerToken}`).send(body);

  test('saves a full week of operating hours', async () => {
    const operating_hours = [
      { day_of_week: 'monday', open_time: '08:00', close_time: '20:00', is_closed: false },
      { day_of_week: 'tuesday', open_time: '08:00', close_time: '20:00', is_closed: false },
      { day_of_week: 'wednesday', open_time: '08:00', close_time: '20:00', is_closed: false },
      { day_of_week: 'thursday', open_time: '08:00', close_time: '20:00', is_closed: false },
      { day_of_week: 'friday', open_time: '08:00', close_time: '22:00', is_closed: false },
      { day_of_week: 'saturday', open_time: '10:00', close_time: '22:00', is_closed: false },
      { day_of_week: 'sunday', open_time: '00:00', close_time: '00:00', is_closed: true },
    ];

    const res = await putSettings({ operating_hours });

    expect(res.status).toBe(200);
    expect(res.body.data.operating_hours).toHaveLength(7);
    const sunday = res.body.data.operating_hours.find((h) => h.day_of_week === 'sunday');
    expect(sunday.is_closed).toBe(true);

    const persisted = await Cafe.findById(cafe._id);
    expect(persisted.operating_hours).toHaveLength(7);
  });

  test('rejects an invalid day_of_week', async () => {
    const res = await putSettings({
      operating_hours: [{ day_of_week: 'someday', open_time: '09:00', close_time: '22:00' }],
    });

    expect(res.status).toBe(400);
  });

  test('rejects a malformed time string', async () => {
    const res = await putSettings({
      operating_hours: [{ day_of_week: 'monday', open_time: '9am', close_time: '22:00' }],
    });

    expect(res.status).toBe(400);
  });

  // M-09: close_time before open_time is a legitimate overnight schedule
  // (e.g. a bar open 18:00, closing 02:00 the next day) -- utils/operatingHours.js
  // rolls it forward by 24h rather than treating it as inverted, so the
  // settings validator must accept it too instead of rejecting every
  // overnight cafe outright.
  test('accepts an overnight schedule where close_time is before open_time', async () => {
    const res = await putSettings({
      operating_hours: [{ day_of_week: 'monday', open_time: '18:00', close_time: '02:00', is_closed: false }],
    });

    expect(res.status).toBe(200);
  });

  test('rejects open_time and close_time being identical for a day that is not closed', async () => {
    const res = await putSettings({
      operating_hours: [{ day_of_week: 'monday', open_time: '09:00', close_time: '09:00', is_closed: false }],
    });

    expect(res.status).toBe(400);
  });

  test('allows close_time before open_time when the day is marked closed (values are ignored)', async () => {
    const res = await putSettings({
      operating_hours: [{ day_of_week: 'monday', open_time: '20:00', close_time: '09:00', is_closed: true }],
    });

    expect(res.status).toBe(200);
  });

  test('rejects a duplicate day_of_week entry', async () => {
    const res = await putSettings({
      operating_hours: [
        { day_of_week: 'monday', open_time: '09:00', close_time: '22:00' },
        { day_of_week: 'monday', open_time: '10:00', close_time: '20:00' },
      ],
    });

    expect(res.status).toBe(400);
  });

  test('a booking outside the newly-configured hours is rejected', async () => {
    await putSettings({
      operating_hours: [
        { day_of_week: 'monday', open_time: '09:00', close_time: '22:00', is_closed: false },
        { day_of_week: 'tuesday', open_time: '09:00', close_time: '22:00', is_closed: false },
        { day_of_week: 'wednesday', open_time: '09:00', close_time: '22:00', is_closed: false },
        { day_of_week: 'thursday', open_time: '09:00', close_time: '22:00', is_closed: false },
        { day_of_week: 'friday', open_time: '09:00', close_time: '22:00', is_closed: false },
        { day_of_week: 'saturday', open_time: '09:00', close_time: '22:00', is_closed: false },
        { day_of_week: 'sunday', open_time: '00:00', close_time: '00:00', is_closed: true },
      ],
    });

    // Find a Sunday comfortably more than the 24h lead-time minimum away
    // (never just "tomorrow", regardless of what day "now" happens to be)
    // and try to book on it — cafe is closed all day.
    const now = new Date();
    let daysUntilSunday = (7 - now.getUTCDay()) % 7;
    if (daysUntilSunday < 2) daysUntilSunday += 7;
    const nextSunday = new Date(now.getTime() + daysUntilSunday * 24 * 60 * 60 * 1000);
    nextSunday.setUTCHours(19, 0, 0, 0);

    const Table = require('../../src/models/Table');
    await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });

    const guest = await User.create({
      name: 'Guest',
      email: 'guest-hours@test.com',
      phone: '+1555800002',
      password_hash: 'pass',
      is_email_verified: true,
    });
    const guestToken = jwt.sign({ id: guest._id.toString() }, config.JWT_SECRET);

    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ start_time: nextSunday.toISOString(), party_size: 2, duration_minutes: 60 });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/closed/i);
  });
});
