const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const { setupTestDB } = require('../setup');
const { encrypt } = require('../../src/utils/encryption');

setupTestDB();

describe('Integration Test: Subscription Enforcement Middleware', () => {
  let cafe;
  let ownerToken;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Subscription Test Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Sub Cafe',
      slug: 'sub-cafe',
      timezone: 'UTC',
      subscription_status: 'inactive', // Subscription is INACTIVE
      payments: {
        razorpay_key_id: 'rzp_test_fixture',
        razorpay_key_secret_encrypted: encrypt('fixture_key_secret'),
        razorpay_webhook_secret_encrypted: encrypt('fixture_webhook_secret'),
        configured: true,
      },
    });

    const owner = await User.create({
      name: 'Cafe Owner',
      email: 'owner@sub.com',
      phone: '+1234123412',
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [
        {
          cafe_id: cafe._id,
          role: 'owner',
          permissions: ['edit_tables', 'view_reservations'],
        },
      ],
    });
    ownerToken = jwt.sign({ id: owner._id.toString() }, config.JWT_SECRET);

    await Table.create({
      cafe_id: cafe._id,
      table_number: 'T1',
      capacity: 2,
    });
  });

  test('blocks reservation booking request with HTTP 402 Payment Required when subscription is inactive', async () => {
    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        start_time: '2026-08-25T19:00:00.000Z',
        party_size: 2,
      });

    expect(res.status).toBe(402);
    expect(res.body.message).toMatch(/subscription is inactive/i);
  });

  test('blocks table creation with HTTP 402 Payment Required when subscription is inactive', async () => {
    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/tables`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        table_number: 'T2',
        capacity: 4,
      });

    expect(res.status).toBe(402);
    expect(res.body.message).toMatch(/subscription is inactive/i);
  });

  test('blocks cafe settings update with HTTP 402 Payment Required when subscription is inactive', async () => {
    const res = await request(app)
      .put(`/api/v1/cafes/${cafe._id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        reservation_rules: { max_party_size: 10 },
      });

    expect(res.status).toBe(402);
    expect(res.body.message).toMatch(/subscription is inactive/i);
  });

  test('allows read-only operations (fetching tables / reservations) when subscription is inactive', async () => {
    const res = await request(app)
      .get(`/api/v1/cafes/${cafe._id}/tables`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });
});
