const request = require('supertest');
const crypto = require('crypto');
const app = require('../../src/app');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const Table = require('../../src/models/Table');
const User = require('../../src/models/User');
const Reservation = require('../../src/models/Reservation');
const { setupTestDB } = require('../setup');
const { encrypt } = require('../../src/utils/encryption');

setupTestDB();

describe('Integration Test: per-cafe Razorpay webhook', () => {
  let cafeA;
  let cafeB;
  let reservationA;
  const orderId = 'order_percafe_123456';
  const secretA = 'cafe_a_webhook_secret';
  const secretB = 'cafe_b_webhook_secret';

  const signRawBody = (rawBody, secret) => crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Per-cafe Webhook Org' });
    cafeA = await Cafe.create({
      org_id: org._id,
      name: 'Webhook Cafe A',
      slug: 'webhook-cafe-a',
      timezone: 'UTC',
      payments: {
        razorpay_key_id: 'rzp_test_a',
        razorpay_key_secret_encrypted: encrypt('cafe_a_key_secret'),
        razorpay_webhook_secret_encrypted: encrypt(secretA),
        configured: true,
      },
    });
    cafeB = await Cafe.create({
      org_id: org._id,
      name: 'Webhook Cafe B',
      slug: 'webhook-cafe-b',
      timezone: 'UTC',
      payments: {
        razorpay_key_id: 'rzp_test_b',
        razorpay_key_secret_encrypted: encrypt('cafe_b_key_secret'),
        razorpay_webhook_secret_encrypted: encrypt(secretB),
        configured: true,
      },
    });

    const user = await User.create({
      name: 'Webhook User',
      email: 'percafe-webhook@test.com',
      phone: '+1555900004',
      password_hash: 'pass',
      is_email_verified: true,
    });
    const table = await Table.create({ cafe_id: cafeA._id, table_number: 'T1', capacity: 2 });
    reservationA = await Reservation.create({
      cafe_id: cafeA._id,
      user_id: user._id,
      table_ids: [table._id],
      start_time: new Date('2026-09-01T19:00:00Z'),
      end_time: new Date('2026-09-01T20:30:00Z'),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'PENDING_PAYMENT',
      payment_data: { order_id: orderId, amount: 100, currency: 'INR', webhook_processed: false },
    });
  });

  const rawBody = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_percafe_9999', order_id: orderId, status: 'captured' } } },
  });

  test("confirms the reservation when signed with that cafe's own webhook secret", async () => {
    const signature = signRawBody(rawBody, secretA);

    const res = await request(app)
      .post(`/api/v1/webhooks/razorpay/${cafeA.slug}`)
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(rawBody);

    expect(res.status).toBe(200);
    const updated = await Reservation.findById(reservationA._id);
    expect(updated.status).toBe('CONFIRMED');
  });

  test("rejects a signature computed with a different cafe's webhook secret", async () => {
    const signature = signRawBody(rawBody, secretB);

    const res = await request(app)
      .post(`/api/v1/webhooks/razorpay/${cafeA.slug}`)
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(rawBody);

    expect(res.status).toBe(400);
    const updated = await Reservation.findById(reservationA._id);
    expect(updated.status).toBe('PENDING_PAYMENT');
  });

  test('returns 404 for an unknown cafe slug', async () => {
    const signature = signRawBody(rawBody, secretA);

    const res = await request(app)
      .post('/api/v1/webhooks/razorpay/no-such-cafe')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(rawBody);

    expect(res.status).toBe(404);
  });
});
