const request = require('supertest');
const app = require('../../src/app');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const CafeCustomer = require('../../src/models/CafeCustomer');
const { setupTestDB } = require('../setup');
const { encrypt } = require('../../src/utils/encryption');

// Explicitly mock Razorpay SDK calls for integration tests
jest.mock('../../src/config/razorpay', () => ({
  createRazorpayClient: jest.fn(() => ({
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
    payments: {
      all: jest.fn().mockResolvedValue({ entity: 'collection', count: 0, items: [] }),
    },
  })),
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
      contact_phone: '+911234567890',
      address: { line1: '1 Test Street', city: 'Kochi', state: 'Kerala', postal_code: '682001' },
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
      payments: {
        razorpay_key_id: 'rzp_test_fixture',
        razorpay_key_secret_encrypted: encrypt('fixture_key_secret'),
        razorpay_webhook_secret_encrypted: encrypt('fixture_webhook_secret'),
        configured: true,
      },
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
      .send({ accept_terms: true,
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
      .send({ accept_terms: true,
        name: 'Bob Guest',
        email: 'bob@example.com',
        phone: '+18885559999',
        password: 'BobsPassword1!',
      });

    expect(authRes.statusCode).toEqual(200);
    expect(authRes.body.data).toBeDefined();
    expect(authRes.body.data.token).toBeDefined();

    const token = authRes.body.data.token;
    const userId = authRes.body.data.user.id;

    // customer-quick-auth creates an unverified account (same as register) —
    // verify it directly so this test can exercise the booking flow, which
    // now requires a verified email.
    await User.findByIdAndUpdate(userId, { is_email_verified: true });

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

  test('customer-quick-auth rejects an existing account when no password is provided', async () => {
    // First call creates the account with a real password.
    await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({ accept_terms: true,
        name: 'Carol Guest',
        email: 'carol@example.com',
        phone: '+18885551111',
        password: 'CarolsRealPassword1!',
      });

    // A second caller who only knows the email/phone, and omits the password,
    // must NOT be able to log in as Carol.
    const res = await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({ accept_terms: true,
        name: 'Someone Else',
        email: 'carol@example.com',
        phone: '+19998887777',
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.data).toBeUndefined();
  });

  test('customer-quick-auth logs in an existing account when the correct password is provided', async () => {
    await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({ accept_terms: true,
        name: 'Dave Guest',
        email: 'dave@example.com',
        phone: '+18885552222',
        password: 'DavesRealPassword1!',
      });

    const res = await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({ accept_terms: true,
        name: 'Dave Guest',
        email: 'dave@example.com',
        phone: '+18885552222',
        password: 'DavesRealPassword1!',
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toEqual('dave@example.com');
  });

  test('customer-quick-auth rejects an existing account when the wrong password is provided', async () => {
    await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({ accept_terms: true,
        name: 'Erin Guest',
        email: 'erin@example.com',
        phone: '+18885553333',
        password: 'ErinsRealPassword1!',
      });

    const res = await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({ accept_terms: true,
        name: 'Erin Guest',
        email: 'erin@example.com',
        phone: '+18885553333',
        password: 'TotallyWrongPassword!',
      });

    expect(res.statusCode).toEqual(401);
    expect(res.body.message).toMatch(/invalid password/i);
  });

  test('customer-quick-auth rejects a brand-new account when no password is provided', async () => {
    const res = await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({ accept_terms: true,
        name: 'Frank NewGuest',
        email: 'frank@example.com',
        phone: '+18885554444',
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.data).toBeUndefined();
  });

  test('customer-quick-auth creates a brand-new account when a password is provided', async () => {
    const res = await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({ accept_terms: true,
        name: 'Frank NewGuest',
        email: 'frank2@example.com',
        phone: '+18885554445',
        password: 'FranksPassword1!',
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toEqual('frank2@example.com');
  });

  test('customer-quick-auth rejects a new signup whose phone number is already registered under a different email', async () => {
    await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({ accept_terms: true,
        name: 'Grace Guest',
        email: 'grace@example.com',
        phone: '+18885555555',
        password: 'GracesPassword1!',
      });

    const res = await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({ accept_terms: true,
        name: 'Someone New',
        email: 'someone-new@example.com',
        phone: '+18885555555',
        password: 'ADifferentPassword1!',
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.data).toBeUndefined();
    expect(res.body.message).toMatch(/phone number is already registered/i);

    // Confirms no account was silently created or logged into under the
    // caller's own submitted identity.
    const newAccount = await User.findOne({ email: 'someone-new@example.com' });
    expect(newAccount).toBeNull();
  });
});
