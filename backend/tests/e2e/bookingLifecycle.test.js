const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const Reservation = require('../../src/models/Reservation');
const { setupTestDB } = require('../setup');
const { encrypt } = require('../../src/utils/encryption');

// Explicitly mock Razorpay SDK calls for E2E tests
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

describe('End-to-End E2E Test: Full Reservation Lifecycle Flow', () => {
  let cafe;
  let customerToken;
  let customerUser;
  let hostToken;
  let hostUser;
  let table;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'E2E Test Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Bistro Cafe',
      slug: 'bistro-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
      payments: {
        razorpay_key_id: 'rzp_test_fixture',
        razorpay_key_secret_encrypted: encrypt('fixture_key_secret'),
        razorpay_webhook_secret_encrypted: encrypt('fixture_webhook_secret'),
        configured: true,
      },
    });

    customerUser = await User.create({
      name: 'Jane Customer',
      email: 'jane@e2e.com',
      phone: '+1999888777',
      password_hash: 'secret',
      is_email_verified: true,
    });
    customerToken = jwt.sign({ id: customerUser._id.toString() }, config.JWT_SECRET);

    hostUser = await User.create({
      name: 'Host Stand Staff',
      email: 'host@bistro.com',
      phone: '+1444333222',
      password_hash: 'secret',
      staff_memberships: [
        {
          cafe_id: cafe._id,
          role: 'host',
          permissions: ['view_reservations', 'edit_reservations'],
        },
      ],
    });
    hostToken = jwt.sign({ id: hostUser._id.toString() }, config.JWT_SECRET);

    table = await Table.create({
      cafe_id: cafe._id,
      table_number: 'T1',
      capacity: 4,
    });
  });

  test('executes complete end-to-end flow from search -> hold -> payment -> check-in -> seated -> completed', async () => {
    const date = '2026-08-30';
    const time = '19:00';

    // Step 1: Customer queries available slots
    const availRes = await request(app)
      .get(`/api/v1/cafes/${cafe._id}/available-slots?date=${date}&time=${time}&partySize=2`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(availRes.status).toBe(200);
    expect(availRes.body.data.available).toBe(true);

    // Step 2: Customer creates reservation hold & payment order
    const bookingRes = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        start_time: `${date}T${time}:00.000Z`,
        party_size: 2,
        duration_minutes: 90,
      });

    expect(bookingRes.status).toBe(201);
    const reservationId = bookingRes.body.data.reservation_id;
    const razorpayOrderId = bookingRes.body.data.razorpay_order_id;
    expect(bookingRes.body.data.status).toBe('PENDING_PAYMENT');
    expect(razorpayOrderId).toBeDefined();

    // Step 3: Razorpay Webhook delivers payment confirmation
    const webhookPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_e2e_12345',
            order_id: razorpayOrderId,
            status: 'captured',
          },
        },
      },
    };
    const signature = crypto
      .createHmac('sha256', 'fixture_webhook_secret')
      .update(JSON.stringify(webhookPayload))
      .digest('hex');

    const webhookRes = await request(app)
      .post(`/api/v1/webhooks/razorpay/${cafe.slug}`)
      .set('x-razorpay-signature', signature)
      .send(webhookPayload);

    expect(webhookRes.status).toBe(200);

    // Verify DB reservation status is now CONFIRMED
    let dbRes = await Reservation.findById(reservationId);
    expect(dbRes.status).toBe('CONFIRMED');

    // Step 4: Customer arrives at host stand. Host updates status to CHECKED_IN
    const checkInRes = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservationId}/status`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        status: 'CHECKED_IN',
        version: dbRes.__v,
      });

    expect(checkInRes.status).toBe(200);
    expect(checkInRes.body.data.status).toBe('CHECKED_IN');
    dbRes = checkInRes.body.data;

    // Step 5: Host seats customer at table (SEATED)
    const seatedRes = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservationId}/status`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        status: 'SEATED',
        version: dbRes.__v,
      });

    expect(seatedRes.status).toBe(200);
    expect(seatedRes.body.data.status).toBe('SEATED');
    dbRes = seatedRes.body.data;

    // Step 6: Customer leaves. Host marks meal COMPLETED
    const completedRes = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservationId}/status`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        status: 'COMPLETED',
        version: dbRes.__v,
      });

    expect(completedRes.status).toBe(200);
    expect(completedRes.body.data.status).toBe('COMPLETED');

    // Final DB state verification
    const finalDbRes = await Reservation.findById(reservationId);
    expect(finalDbRes.status).toBe('COMPLETED');
    expect(finalDbRes.confirmed_at).toBeDefined();
    expect(finalDbRes.checked_in_at).toBeDefined();
    expect(finalDbRes.seated_at).toBeDefined();
    expect(finalDbRes.completed_at).toBeDefined();
    expect(finalDbRes.status_history.length).toBe(6); // HOLD -> PENDING_PAYMENT -> CONFIRMED -> CHECKED_IN -> SEATED -> COMPLETED
  }, 40000);
});
