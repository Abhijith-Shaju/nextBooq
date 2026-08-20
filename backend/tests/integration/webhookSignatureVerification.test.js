const request = require('supertest');
const crypto = require('crypto');
const app = require('../../src/app');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const Reservation = require('../../src/models/Reservation');
const { setupTestDB } = require('../setup');
const { encrypt } = require('../../src/utils/encryption');

setupTestDB();

describe('Integration Test: Razorpay Webhook Signature Verification (raw body)', () => {
  let cafe;
  let reservation;
  const orderId = 'order_rawbody_123456';
  const secret = 'fixture_webhook_secret';

  const signRawBody = (rawBody) => crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Webhook Sig Test Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Webhook Sig Cafe',
      slug: 'webhook-sig-cafe',
      timezone: 'UTC',
      payments: {
        razorpay_key_id: 'rzp_test_fixture',
        razorpay_key_secret_encrypted: encrypt('fixture_key_secret'),
        razorpay_webhook_secret_encrypted: encrypt('fixture_webhook_secret'),
        configured: true,
      },
    });

    const user = await User.create({
      name: 'Webhook Sig User',
      email: 'webhook-sig@test.com',
      phone: '+1112223344',
      password_hash: 'pass',
      is_email_verified: true,
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

  test('accepts a real Razorpay-style payload whose raw bytes differ from JSON.stringify(parsedBody)', async () => {
    // Razorpay signs the exact bytes it sends over the wire. That payload is not
    // guaranteed to match JSON.stringify(JSON.parse(payload)) byte-for-byte (key
    // order, spacing). Simulate that by hand-crafting non-canonical raw JSON:
    // extra whitespace + payment.entity keys in a different order than the
    // controller would produce if it re-serialized req.body.
    const rawBody =
      '{\n  "event": "payment.captured",\n  "payload": {\n    "payment": {\n      "entity": {\n' +
      `        "order_id": "${orderId}",\n        "id": "pay_rawbody_9999",\n        "status": "captured"\n` +
      '      }\n    }\n  }\n}\n';

    const signature = signRawBody(rawBody);

    const res = await request(app)
      .post(`/api/v1/webhooks/razorpay/${cafe.slug}`)
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(rawBody);

    expect(res.status).toBe(200);

    const updatedRes = await Reservation.findById(reservation._id);
    expect(updatedRes.status).toBe('CONFIRMED');
    expect(updatedRes.payment_data.webhook_processed).toBe(true);
    expect(updatedRes.payment_data.payment_id).toBe('pay_rawbody_9999');
  });

  test('rejects a payload whose signature was computed over different bytes', async () => {
    const rawBody = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_tampered', order_id: orderId, status: 'captured' } } },
    });
    const tamperedBody = rawBody.replace('pay_tampered', 'pay_swapped_in_after_signing');

    const signature = signRawBody(rawBody);

    const res = await request(app)
      .post(`/api/v1/webhooks/razorpay/${cafe.slug}`)
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(tamperedBody);

    expect(res.status).toBe(400);

    const updatedRes = await Reservation.findById(reservation._id);
    expect(updatedRes.status).toBe('PENDING_PAYMENT');
  });
});
