const Organization = require('../../src/models/Organization');
const Cafe = require('../../src/models/Cafe');
const Subscription = require('../../src/models/Subscription');
const { expireLapsedSubscriptions } = require('../../src/services/subscriptionExpiryService');
const { setupTestDB } = require('../setup');

setupTestDB();

const makeOrgCafe = async (slug) => {
  const org = await Organization.create({ name: `Expiry Org ${slug}` });
  const cafe = await Cafe.create({
    org_id: org._id,
    name: `Expiry Cafe ${slug}`,
    slug,
    timezone: 'UTC',
    subscription_status: 'active',
  });
  return { org, cafe };
};

describe('expireLapsedSubscriptions', () => {
  test('flips a lapsed active, is_current subscription to past_due and syncs Cafe.subscription_status', async () => {
    const { org, cafe } = await makeOrgCafe('expiry-lapsed');
    const sub = await Subscription.create({
      org_id: org._id,
      cafe_id: cafe._id,
      term_months: 1,
      price_per_month: 9000,
      period_start: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      current_period_end: new Date(Date.now() - 60 * 1000), // already passed
      status: 'active',
      is_current: true,
    });

    const result = await expireLapsedSubscriptions();

    expect(result.expiredCount).toBe(1);
    const updated = await Subscription.findById(sub._id);
    expect(updated.status).toBe('past_due');
    const updatedCafe = await Cafe.findById(cafe._id);
    expect(updatedCafe.subscription_status).toBe('past_due');
  });

  test('leaves an active subscription with a future current_period_end untouched', async () => {
    const { org, cafe } = await makeOrgCafe('expiry-future');
    const sub = await Subscription.create({
      org_id: org._id,
      cafe_id: cafe._id,
      term_months: 1,
      price_per_month: 9000,
      current_period_end: new Date(Date.now() + 60 * 1000),
      status: 'active',
      is_current: true,
    });

    await expireLapsedSubscriptions();

    const updated = await Subscription.findById(sub._id);
    expect(updated.status).toBe('active');
  });

  test('ignores a lapsed subscription that is not is_current (already superseded)', async () => {
    const { org, cafe } = await makeOrgCafe('expiry-superseded');
    const sub = await Subscription.create({
      org_id: org._id,
      cafe_id: cafe._id,
      term_months: 1,
      price_per_month: 9000,
      current_period_end: new Date(Date.now() - 60 * 1000),
      status: 'active',
      is_current: false,
    });

    const result = await expireLapsedSubscriptions();

    expect(result.expiredCount).toBe(0);
    const updated = await Subscription.findById(sub._id);
    expect(updated.status).toBe('active');
  });

  test('ignores a lapsed subscription that is already inactive (manually disabled, not a billing lapse)', async () => {
    const { org, cafe } = await makeOrgCafe('expiry-inactive');
    const sub = await Subscription.create({
      org_id: org._id,
      cafe_id: cafe._id,
      term_months: 1,
      price_per_month: 9000,
      current_period_end: new Date(Date.now() - 60 * 1000),
      status: 'inactive',
      is_current: true,
    });

    const result = await expireLapsedSubscriptions();

    expect(result.expiredCount).toBe(0);
    const updated = await Subscription.findById(sub._id);
    expect(updated.status).toBe('inactive');
  });
});
