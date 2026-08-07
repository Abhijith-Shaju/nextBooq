const request = require('supertest');
const app = require('../../src/app');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const CafeCustomer = require('../../src/models/CafeCustomer');
const { setupTestDB } = require('../setup');

// Explicitly mock Razorpay SDK calls for integration tests
jest.mock('../../src/config/razorpay', () => ({
  orders: {
    create: jest.fn().mockImplementation(async (options) => ({
      id: `order_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      entity: 'order',
      amount: options.amount,
      currency: options.currency || 'INR',
      receipt: options.receipt,
      status: 'created',
      created_at: Math.floor(Date.now() / 1000),
    })),
  },
}));

setupTestDB();

describe('Customer Authentication & Reservation Integration Tests', () => {
  let cafe;
  let customerUser;
  let customerToken;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Customer Test Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Customer Test Cafe',
      slug: 'customer-test-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
      operating_hours: [
        { day_of_week: 'monday', open_time: '00:00', close_time: '23:59', is_closed: false },
        { day_of_week: 'tuesday', open_time: '00:00', close_time: '23:59', is_closed: false },
        { day_of_week: 'wednesday', open_time: '00:00', close_time: '23:59', is_closed: false },
        { day_of_week: 'thursday', open_time: '00:00', close_time: '23:59', is_closed: false },
        { day_of_week: 'friday', open_time: '00:00', close_time: '23:59', is_closed: false },
        { day_of_week: 'saturday', open_time: '00:00', close_time: '23:59', is_closed: false },
        { day_of_week: 'sunday', open_time: '00:00', close_time: '23:59', is_closed: false },
      ],
    });

    await Table.create({
      cafe_id: cafe._id,
      table_number: 'T-01',
      capacity: 4,
      status: 'active',
    });
  });

  test('POST /api/v1/auth/customer-quick-auth creates or logs in a customer', async () => {
    const res = await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({
        name: 'Alice Guest',
        email: 'alice@example.com',
        phone: '+18885551234',
        password: 'Password123!',
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('success');
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toEqual('alice@example.com');

    customerToken = res.body.data.token;
  });

  test('Customer holds reservation and populates CafeCustomer rolodex record', async () => {
    // 1. Quick auth customer
    const authRes = await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({
        name: 'Bob Guest',
        email: 'bob@example.com',
        phone: '+18885559999',
      });

    expect(authRes.statusCode).toEqual(200);
    expect(authRes.body.data).toBeDefined();
    expect(authRes.body.data.token).toBeDefined();

    const token = authRes.body.data.token;
    const userId = authRes.body.data.user.id;

    // 2. Hold reservation
    const startTime = new Date(Date.now() + 86400000).toISOString();
    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        start_time: startTime,
        party_size: 2,
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.data.reservation_id).toBeDefined();

    // 3. Verify CafeCustomer rolodex record created
    const rolodex = await CafeCustomer.findOne({ cafe_id: cafe._id, user_id: userId });
    expect(rolodex).not.toBeNull();

    // 4. Customer fetches reservation history
    const historyRes = await request(app)
      .get('/api/v1/customer/reservations')
      .set('Authorization', `Bearer ${token}`);

    expect(historyRes.statusCode).toEqual(200);
    expect(historyRes.body.data.length).toBeGreaterThan(0);
    expect(historyRes.body.data[0].party_size).toEqual(2);
  });
});
