const Organization = require('../../src/models/Organization');
const Cafe = require('../../src/models/Cafe');
const Subscription = require('../../src/models/Subscription');
const mongoose = require('mongoose');
const { expireLapsedSubscriptions } = require('../../src/services/subscriptionExpiryService');
const { recordSubscriptionTerm } = require('../../src/services/subscriptionAdminService');
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

  test('flips a lapsed current trial to inactive and syncs Cafe.subscription_status', async () => {
    const { org, cafe } = await makeOrgCafe('expiry-trial');
    const sub = await Subscription.create({
      org_id: org._id,
      cafe_id: cafe._id,
      term_months: 1,
      price_per_month: 0,
      period_start: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      current_period_end: new Date(Date.now() - 60 * 1000),
      status: 'trial',
      is_current: true,
    });

    const result = await expireLapsedSubscriptions();

    expect(result.expiredCount).toBe(1);
    expect((await Subscription.findById(sub._id)).status).toBe('inactive');
    expect((await Cafe.findById(cafe._id)).subscription_status).toBe('inactive');
  });

  test('does not overwrite a concurrent renewal that supersedes a lapsed subscription after the expiry scan', async () => {
    const { org, cafe } = await makeOrgCafe('expiry-renewal-race');
    const lapsed = await Subscription.create({
      org_id: org._id,
      cafe_id: cafe._id,
      term_months: 1,
      price_per_month: 9000,
      period_start: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      current_period_end: new Date(Date.now() - 60 * 1000),
      status: 'active',
      is_current: true,
    });

    const realFind = Subscription.find.bind(Subscription);
    let renewed = false;
    const findSpy = jest.spyOn(Subscription, 'find').mockImplementation(async (...args) => {
      const scanned = await realFind(...args);
      if (!renewed) {
        renewed = true;
        await recordSubscriptionTerm({
          cafeId: cafe._id,
          orgId: org._id,
          termMonths: 12,
          pricePerMonth: 10000,
          adminUserId: null,
          note: 'concurrent renewal',
        });
      }
      return scanned;
    });

    try {
      const result = await expireLapsedSubscriptions();
      expect(result.expiredCount).toBe(0);
    } finally {
      findSpy.mockRestore();
    }

    expect((await Subscription.findById(lapsed._id)).is_current).toBe(false);
    const current = await Subscription.findOne({ cafe_id: cafe._id, is_current: true });
    expect(current).toMatchObject({ status: 'active', term_months: 12, price_per_month: 10000 });
    expect((await Cafe.findById(cafe._id)).subscription_status).toBe('active');
  });

  test('counts only the committed retry outcome when a transaction callback is retried', async () => {
    const subscriptionId = new mongoose.Types.ObjectId();
    const cafeId = new mongoose.Types.ObjectId();
    const findSpy = jest.spyOn(Subscription, 'find').mockResolvedValue([{
      _id: subscriptionId,
      cafe_id: cafeId,
      status: 'active',
    }]);
    const subscriptionUpdateSpy = jest.spyOn(Subscription, 'updateOne')
      .mockResolvedValueOnce({ modifiedCount: 1 })
      .mockResolvedValueOnce({ modifiedCount: 0 });
    const cafeUpdateSpy = jest.spyOn(Cafe, 'updateOne').mockResolvedValue({ modifiedCount: 1 });
    const transactionSpy = jest.spyOn(mongoose.connection, 'transaction').mockImplementation(async (callback) => {
      await callback({ attempt: 1 });
      return callback({ attempt: 2 });
    });

    try {
      await expect(expireLapsedSubscriptions()).resolves.toEqual({ expiredCount: 0 });
      expect(subscriptionUpdateSpy).toHaveBeenCalledTimes(2);
      expect(cafeUpdateSpy).toHaveBeenCalledTimes(1);
    } finally {
      transactionSpy.mockRestore();
      cafeUpdateSpy.mockRestore();
      subscriptionUpdateSpy.mockRestore();
      findSpy.mockRestore();
    }
  });
});
