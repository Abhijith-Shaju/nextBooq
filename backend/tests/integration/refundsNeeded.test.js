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

// M-07: a payment that succeeds after its reservation is already terminal
// gets flagged requires_manual_refund by the webhook handler, but nothing
// ever surfaced that flag anywhere -- a customer charged for an expired
// slot was owed money that existed only in a server log line.
describe('Integration Test: GET /platform-admin/refunds-needed', () => {
  let admin;
  let adminToken;
  let cafe;
  let customer;
  let table;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Refunds Needed Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Refunds Needed Cafe',
      slug: `refunds-needed-cafe-${Date.now()}`,
      timezone: 'UTC',
      subscription_status: 'active',
    });
    table = await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });
    customer = await User.create({
      name: 'Overcharged Diner',
      email: `refund-diner-${Date.now()}@test.com`,
      phone: '+15559990401',
      password_hash: 'pass',
      is_email_verified: true,
    });
    admin = await User.create({
      name: 'Platform Admin',
      email: `refund-admin-${Date.now()}@test.com`,
      phone: '+15559990402',
      password_hash: 'pass',
      is_email_verified: true,
      is_platform_admin: true,
    });
    adminToken = jwt.sign({ id: admin._id.toString() }, config.JWT_SECRET);
  });

  test('lists a reservation flagged requires_manual_refund, with cafe and customer details', async () => {
    const flagged = await Reservation.create({
      cafe_id: cafe._id,
      user_id: customer._id,
      table_ids: [table._id],
      start_time: new Date(Date.now() + 24 * 60 * 60 * 1000),
      end_time: new Date(Date.now() + 25 * 60 * 60 * 1000),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'CANCELLED',
      payment_data: {
        order_id: 'order_flagged_1',
        amount: 100,
        status: 'SUCCESS_LATE',
        webhook_processed: true,
        requires_manual_refund: true,
      },
    });

    const res = await request(app)
      .get('/api/v1/platform-admin/refunds-needed')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]._id).toBe(flagged._id.toString());
    expect(res.body.data[0].cafe_id.name).toBe('Refunds Needed Cafe');
    expect(res.body.data[0].user_id.email).toBe(customer.email);
  });

  test('does not list a reservation that was never flagged', async () => {
    await Reservation.create({
      cafe_id: cafe._id,
      user_id: customer._id,
      table_ids: [table._id],
      start_time: new Date(Date.now() + 24 * 60 * 60 * 1000),
      end_time: new Date(Date.now() + 25 * 60 * 60 * 1000),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'CONFIRMED',
    });

    const res = await request(app)
      .get('/api/v1/platform-admin/refunds-needed')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  test('is not reachable without platform-admin access', async () => {
    const staff = await User.create({
      name: 'Regular Staff',
      email: `refund-staff-${Date.now()}@test.com`,
      phone: '+15559990403',
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [{ cafe_id: cafe._id, role: 'owner', permissions: [] }],
    });
    const staffToken = jwt.sign({ id: staff._id.toString() }, config.JWT_SECRET);

    const res = await request(app)
      .get('/api/v1/platform-admin/refunds-needed')
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(403);
  });
});
