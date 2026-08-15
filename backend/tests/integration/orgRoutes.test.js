const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Organization = require('../../src/models/Organization');
const Cafe = require('../../src/models/Cafe');
const User = require('../../src/models/User');
const Reservation = require('../../src/models/Reservation');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Org routes', () => {
  let ownerToken, managerToken, org, cafeA, cafeB;

  beforeEach(async () => {
    org = await Organization.create({ name: 'Org Routes Test Org' });
    cafeA = await Cafe.create({
      org_id: org._id,
      name: 'Cafe A',
      slug: 'org-routes-cafe-a',
      timezone: 'UTC',
      subscription_status: 'active',
    });
    cafeB = await Cafe.create({
      org_id: org._id,
      name: 'Cafe B',
      slug: 'org-routes-cafe-b',
      timezone: 'UTC',
      subscription_status: 'trial',
    });

    const owner = await User.create({
      name: 'Org Owner',
      email: 'org-routes-owner@test.com',
      phone: '+15559930001',
      password_hash: 'pass',
      staff_memberships: [
        { cafe_id: cafeA._id, role: 'owner', permissions: [] },
        { cafe_id: cafeB._id, role: 'owner', permissions: [] },
      ],
    });
    ownerToken = jwt.sign({ id: owner._id.toString() }, config.JWT_SECRET);

    const manager = await User.create({
      name: 'Cafe Manager',
      email: 'org-routes-manager@test.com',
      phone: '+15559930002',
      password_hash: 'pass',
      staff_memberships: [{ cafe_id: cafeA._id, role: 'manager', permissions: [] }],
    });
    managerToken = jwt.sign({ id: manager._id.toString() }, config.JWT_SECRET);
  });

  test('an unauthenticated request gets 401', async () => {
    const res = await request(app).get('/api/v1/org/cafes');
    expect(res.status).toBe(401);
  });

  test('a manager (not org owner) gets 403', async () => {
    const res = await request(app)
      .get('/api/v1/org/cafes')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(403);
  });

  test('an org owner gets their org\'s cafes with subscription status and today\'s reservation count', async () => {
    const now = new Date();
    await Reservation.create({
      cafe_id: cafeA._id,
      user_id: (await User.create({
        name: 'Guest',
        email: 'org-routes-guest@test.com',
        phone: '+15559930003',
        password_hash: 'pass',
      }))._id,
      table_ids: [],
      start_time: now,
      end_time: new Date(now.getTime() + 60 * 60 * 1000),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'CONFIRMED',
    });

    const res = await request(app)
      .get('/api/v1/org/cafes')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    const cafeAResult = res.body.data.find((c) => c._id === cafeA._id.toString());
    expect(cafeAResult).toMatchObject({
      name: 'Cafe A',
      slug: 'org-routes-cafe-a',
      subscription_status: 'active',
      today_reservation_count: 1,
    });
    const cafeBResult = res.body.data.find((c) => c._id === cafeB._id.toString());
    expect(cafeBResult).toMatchObject({
      name: 'Cafe B',
      subscription_status: 'trial',
      today_reservation_count: 0,
    });
  });
});
