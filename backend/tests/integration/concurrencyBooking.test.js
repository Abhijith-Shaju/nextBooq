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

// Explicitly mock Razorpay SDK calls for this concurrency test
jest.mock('../../src/config/razorpay', () => ({
  createRazorpayClient: jest.fn(() => ({
    orders: {
      create: jest.fn().mockImplementation(async (options) => ({
        id: `order_mock_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
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

describe('Integration Test: High Concurrency Double-Booking Stress Test', () => {
  let cafe;
  let userToken;
  let userId;

  beforeEach(async () => {
    // 1. Create Organization & Cafe
    const org = await Organization.create({ name: 'Concurrency Test Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Concurrency Cafe',
      slug: 'concurrency-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });

    // 2. Create User & Auth Token
    const user = await User.create({
      name: 'Concurrent User',
      email: 'concurrent@example.com',
      phone: '+1234567890',
      password_hash: 'hashedpassword',
    });
    userId = user._id;
    userToken = jwt.sign({ id: user._id.toString() }, config.JWT_SECRET);

    // 3. Create SINGLE 2-top table
    await Table.create({
      cafe_id: cafe._id,
      table_number: 'T1',
      capacity: 2,
      can_merge_with: [],
      status: 'active',
    });
  });

  test('50 concurrent booking requests for a single table result in exactly 1 reservation created', async () => {
    // Computed relative to "now" (rather than hardcoded) so this test doesn't
    // start failing the booking_lead_time_hours check once real calendar time
    // catches up to a fixed date. Pinned to 19:00 UTC, safely inside the
    // cafe's default 09:00-22:00 operating hours regardless of what time of
    // day the suite happens to run.
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    futureDate.setUTCHours(19, 0, 0, 0);
    const startTime = futureDate.toISOString();
    const concurrentRequests = 50;
    const requestPromises = [];

    for (let i = 0; i < concurrentRequests; i++) {
      requestPromises.push(
        request(app)
          .post(`/api/v1/cafes/${cafe._id}/reservations`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            start_time: startTime,
            party_size: 2,
            duration_minutes: 90,
          })
      );
    }

    const responses = await Promise.all(requestPromises);

    const createdResponses = responses.filter((r) => r.status === 201);
    const rejectedResponses = responses.filter((r) => r.status === 409 || r.status === 422);

    // EXACT ACCEPTANCE CRITERIA:
    // Exactly 1 request succeeds with 201 Created.
    // Remaining 49 requests fail with 409 Conflict or 422 Unprocessable Entity.
    expect(createdResponses.length).toBe(1);
    expect(rejectedResponses.length).toBe(49);

    // Verify Database state: Exactly 1 reservation document created
    const reservationCount = await Reservation.countDocuments({ cafe_id: cafe._id });
    expect(reservationCount).toBe(1);
  }, 30000);
});
