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

// L-09: a guest's reservation history was returned with no limit -- grows
// without bound over years of visits. Capped as a safety measure, not a
// full pagination feature.
describe('Integration Test: GET /customer/reservations caps the returned history', () => {
  let cafe;
  let table;
  let customer;
  let token;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Customer History Cap Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Customer History Cap Cafe',
      slug: `customer-history-cap-cafe-${Date.now()}`,
      timezone: 'UTC',
      subscription_status: 'active',
    });
    table = await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });
    customer = await User.create({
      name: 'Frequent Diner',
      email: `frequent-diner-${Date.now()}@test.com`,
      phone: '+15559990801',
      password_hash: 'pass',
      is_email_verified: true,
    });
    token = jwt.sign({ id: customer._id.toString() }, config.JWT_SECRET);

    const reservations = Array.from({ length: 205 }, (_, i) => ({
      cafe_id: cafe._id,
      user_id: customer._id,
      table_ids: [table._id],
      start_time: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
      end_time: new Date(Date.now() - i * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'COMPLETED',
    }));
    await Reservation.insertMany(reservations);
  });

  test('never returns more than the cap even when the guest has more history than that', async () => {
    const res = await request(app)
      .get('/api/v1/customer/reservations')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(200);
    expect(res.body.data.length).toBe(200);
  });
});
