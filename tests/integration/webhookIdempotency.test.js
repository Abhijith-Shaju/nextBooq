const request = require('supertest');
const crypto = require('crypto');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const Reservation = require('../../src/models/Reservation');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Integration Test: Razorpay Webhook Idempotency & Terminal State Handling', () => {
  let cafe;
  let reservation;
  const orderId = 'order_test_123456';
  const secret = config.RAZORPAY_WEBHOOK_SECRET || 'rzp_test_webhook_secret';

  const generateSignature = (body) => {
    return crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
  };

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Webhook Test Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Webhook Cafe',
      slug: 'webhook-cafe',
      timezone: 'UTC',
    });

    const user = await User.create({
      name: 'Webhook User',
      email: 'webhook@test.com',
      phone: '+1112223333',
      password_hash: 'pass',
    });

    const table = await Table.create({
      cafe_id: cafe._id,
      table_number: 'T1',
      capacity: 2,
    });

    reservation = await Reservation.create({
      cafe_id: cafe._id,
      user_id: user._id,
      table_ids: [table._id],
      start_time: new Date('2026-08-20T19:00:00Z'),
      end_time: new Date('2026-08-20T20:30:00Z'),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'PENDING_PAYMENT',
      payment_data: {
        order_id: orderId,
        amount: 100,
        currency: 'INR',
        webhook_processed: false,
      },
    });
  });

  test('successfully processes payment.captured webhook and transitions status to CONFIRMED', async () => {
    const body = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_test_9999',
            order_id: orderId,
            status: 'captured',
          },
        },
      },
    };
    const signature = generateSignature(body);

    const res = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('x-razorpay-signature', signature)
      .send(body);

    expect(res.status).toBe(200);

    const updatedRes = await Reservation.findById(reservation._id);
    expect(updatedRes.status).toBe('CONFIRMED');
    expect(updatedRes.payment_data.webhook_processed).toBe(true);
    expect(updatedRes.payment_data.payment_id).toBe('pay_test_9999');
  });

  test('enforces webhook idempotency: second identical webhook is ignored gracefully', async () => {
    // Mark reservation as already processed
    await Reservation.updateOne(
      { _id: reservation._id },
      { status: 'CONFIRMED', 'payment_data.webhook_processed': true }
    );

    const body = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_test_9999',
            order_id: orderId,
          },
        },
      },
    };
    const signature = generateSignature(body);

    const res = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('x-razorpay-signature', signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already processed/i);
  });

  test('handles late webhook for CANCELLED reservation by setting requires_manual_refund flag', async () => {
    // Set reservation to CANCELLED state explicitly in MongoDB
    await Reservation.updateOne({ _id: reservation._id }, { status: 'CANCELLED' });

    const body = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_late_8888',
            order_id: orderId,
          },
        },
      },
    };
    const signature = generateSignature(body);

    const res = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('x-razorpay-signature', signature)
      .send(body);

    expect(res.status).toBe(200);

    const updatedRes = await Reservation.findById(reservation._id);
    expect(updatedRes.status).toBe('CANCELLED'); // Remains CANCELLED
    expect(updatedRes.payment_data.requires_manual_refund).toBe(true);
    expect(updatedRes.payment_data.webhook_processed).toBe(true);
  });
});
