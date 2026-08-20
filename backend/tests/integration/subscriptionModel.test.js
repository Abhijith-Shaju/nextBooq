const Organization = require('../../src/models/Organization');
const Cafe = require('../../src/models/Cafe');
const Subscription = require('../../src/models/Subscription');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Subscription model', () => {
  let org, cafe;

  beforeEach(async () => {
    org = await Organization.create({ name: 'Model Test Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Model Test Cafe',
      slug: 'model-test-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });
  });

  test('creates a subscription with the new term/price/current fields', async () => {
    const sub = await Subscription.create({
      org_id: org._id,
      cafe_id: cafe._id,
      term_months: 12,
      price_per_month: 7000,
      current_period_end: new Date('2027-01-01T00:00:00Z'),
    });

    expect(sub.status).toBe('active'); // default
    expect(sub.is_current).toBe(true); // default
    expect(sub.period_start).toBeInstanceOf(Date); // defaults to now
    expect(sub.plan_tier).toBeUndefined(); // dropped field
  });

  test('rejects a term_months value outside the allowed set', async () => {
    await expect(
      Subscription.create({
        org_id: org._id,
        cafe_id: cafe._id,
        term_months: 3,
        price_per_month: 5000,
        current_period_end: new Date('2027-01-01T00:00:00Z'),
      })
    ).rejects.toThrow();
  });

  test('rejects a subscription with no current_period_end', async () => {
    await expect(
      Subscription.create({
        org_id: org._id,
        cafe_id: cafe._id,
        term_months: 1,
        price_per_month: 9000,
      })
    ).rejects.toThrow();
  });
});

describe('User.is_platform_admin', () => {
  test('defaults to false', async () => {
    const user = await User.create({
      name: 'Regular User',
      email: 'regular@test.com',
      phone: '+1555990001',
      password_hash: 'pass',
      is_email_verified: true,
    });
    expect(user.is_platform_admin).toBe(false);
  });

  test('can be set to true', async () => {
    const user = await User.create({
      name: 'Admin User',
      email: 'admin@test.com',
      phone: '+1555990002',
      password_hash: 'pass',
      is_email_verified: true,
      is_platform_admin: true,
    });
    expect(user.is_platform_admin).toBe(true);
  });
});
