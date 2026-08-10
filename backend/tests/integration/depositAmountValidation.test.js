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

jest.mock('../../src/config/razorpay', () => ({
  orders: {
    create: jest.fn().mockImplementation(async (options) => ({
      id: `order_mock_${Date.now()}`,
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

describe('Integration Test: deposit_amount validation on booking creation', () => {
  let cafe;
  let token;

  const futureStartTime = () => {
    const d = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    d.setUTCHours(19, 0, 0, 0);
    return d.toISOString();
  };

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Deposit Test Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Deposit Cafe',
      slug: 'deposit-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });
    const user = await User.create({
      name: 'Deposit User',
      email: 'deposit-user@test.com',
      phone: '+1555444001',
      password_hash: 'pass',
    });
    token = jwt.sign({ id: user._id.toString() }, config.JWT_SECRET);
    await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });
  });

  test.each([
    ['negative', -50],
    ['zero', 0],
    ['NaN-producing string', 'not-a-number'],
    ['absurdly large', 10_000_000],
  ])('rejects a %s deposit_amount without creating a reservation', async (_label, badDeposit) => {
    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ start_time: futureStartTime(), party_size: 2, deposit_amount: badDeposit });

    expect(res.status).toBe(400);

    const count = await Reservation.countDocuments({ cafe_id: cafe._id });
    expect(count).toBe(0);
  });

  test('accepts a valid positive deposit_amount', async () => {
    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ start_time: futureStartTime(), party_size: 2, deposit_amount: 250 });

    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(25000); // paise
  });

  test('defaults to 100 when deposit_amount is omitted', async () => {
    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ start_time: futureStartTime(), party_size: 2 });

    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(10000); // paise
  });
});
