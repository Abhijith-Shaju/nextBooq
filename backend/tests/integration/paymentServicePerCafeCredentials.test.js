const Reservation = require('../../src/models/Reservation');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const Table = require('../../src/models/Table');
const { setupTestDB } = require('../setup');
const { createOrderForReservation } = require('../../src/services/paymentService');
const { encrypt } = require('../../src/utils/encryption');
const { createRazorpayClient } = require('../../src/config/razorpay');

setupTestDB();

const makeCafeAndHold = async ({ configured }) => {
  const org = await Organization.create({ name: 'Per-cafe Credentials Org' });
  const cafe = await Cafe.create({
    org_id: org._id,
    name: 'Per-cafe Credentials Cafe',
    slug: 'per-cafe-credentials',
    timezone: 'UTC',
    payments: configured
      ? {
          razorpay_key_id: 'rzp_test_thiscafe',
          razorpay_key_secret_encrypted: encrypt('thiscafe_secret'),
          razorpay_webhook_secret_encrypted: encrypt('thiscafe_webhook_secret'),
          configured: true,
        }
      : undefined,
  });
  const table = await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 2 });
  const reservation = await Reservation.create({
    cafe_id: cafe._id,
    user_id: new (require('mongoose').Types.ObjectId)(),
    table_ids: [table._id],
    start_time: new Date('2026-09-01T19:00:00Z'),
    end_time: new Date('2026-09-01T20:30:00Z'),
    party_size: 2,
    reservation_timezone: 'UTC',
    status: 'HOLD',
  });
  return { cafe, reservation };
};

describe('Integration Test: paymentService uses each cafe\'s own Razorpay credentials', () => {
  beforeEach(() => {
    createRazorpayClient.mockClear();
  });

  test('builds the Razorpay client from the cafe\'s own decrypted credentials', async () => {
    const { cafe, reservation } = await makeCafeAndHold({ configured: true });

    await createOrderForReservation(reservation._id, cafe._id, 100);

    expect(createRazorpayClient).toHaveBeenCalledWith({
      key_id: 'rzp_test_thiscafe',
      key_secret: 'thiscafe_secret',
    });
  });

  test('rejects order creation for an unconfigured cafe outside development', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { cafe, reservation } = await makeCafeAndHold({ configured: false });

      await expect(createOrderForReservation(reservation._id, cafe._id, 100)).rejects.toThrow(
        /payments/i
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
