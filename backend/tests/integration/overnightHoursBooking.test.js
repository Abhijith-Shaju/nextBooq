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

jest.mock('../../src/config/razorpay', () => ({
  createRazorpayClient: jest.fn(() => ({
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
    payments: {
      all: jest.fn().mockResolvedValue({ entity: 'collection', count: 0, items: [] }),
    },
  })),
}));

setupTestDB();

// M-09 end-to-end: it's not enough for generateSlotTimes to *offer* an
// overnight slot as bookable -- the actual POST /reservations path (which
// runs validateOperatingHours) has to accept it too. Before the fix, every
// slot an overnight-hours cafe offered would fail here.
describe('Integration Test: a cafe with overnight operating hours can actually take a booking', () => {
  let token;
  let cafe;

  // 10 days out, so the lead-time check never interferes, landing on
  // whichever weekday that is relative to "today" -- we set every day's
  // hours to the same overnight window so this is timezone/weekday-agnostic.
  const dayName = (date) =>
    ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getUTCDay()];

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Overnight Booking Org' });
    const bookingDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const weekday = dayName(bookingDate);

    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Overnight Booking Cafe',
      slug: `overnight-booking-cafe-${Date.now()}`,
      timezone: 'UTC',
      contact_phone: '+911234567890',
      address: { line1: '1 Test Street', city: 'Kochi', state: 'Kerala', postal_code: '682001' },
      subscription_status: 'active',
      operating_hours: [{ day_of_week: weekday, open_time: '18:00', close_time: '02:00', is_closed: false }],
      payments: {
        razorpay_key_id: 'rzp_test_overnight',
        razorpay_key_secret_encrypted: encrypt('overnight_secret'),
        razorpay_webhook_secret_encrypted: encrypt('overnight_webhook_secret'),
        configured: true,
      },
    });
    await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });

    const user = await User.create({
      name: 'Late Night Diner',
      email: `overnight-diner-${Date.now()}@test.com`,
      phone: '+15559990501',
      password_hash: 'pass',
      is_email_verified: true,
    });
    token = jwt.sign({ id: user._id.toString() }, config.JWT_SECRET);

    // Pin the current bookingDate's weekday's schedule; set start_time to
    // 20:00 UTC that day, safely within the 18:00-02:00 overnight window.
    cafe._bookingStartTime = new Date(bookingDate);
    cafe._bookingStartTime.setUTCHours(20, 0, 0, 0);
  });

  test('accepts a reservation in the evening portion of an overnight window', async () => {
    const res = await request(app)
      .post(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        start_time: cafe._bookingStartTime.toISOString(),
        duration_minutes: 90,
        party_size: 2,
      });

    expect(res.status).toBe(201);
  });
});
