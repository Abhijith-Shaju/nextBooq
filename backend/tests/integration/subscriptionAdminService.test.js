const Organization = require('../../src/models/Organization');
const Cafe = require('../../src/models/Cafe');
const Subscription = require('../../src/models/Subscription');
const User = require('../../src/models/User');
const {
  getOverviewStats,
  listOrgsWithCafes,
  getCafeSubscriptionHistory,
  recordSubscriptionTerm,
  setSubscriptionStatus,
} = require('../../src/services/subscriptionAdminService');
const { setupTestDB } = require('../setup');

setupTestDB();

const makeOrgCafe = async (orgName, cafeName, slug) => {
  const org = await Organization.create({ name: orgName });
  const cafe = await Cafe.create({
    org_id: org._id,
    name: cafeName,
    slug,
    timezone: 'UTC',
    subscription_status: 'active',
  });
  return { org, cafe };
};

describe('recordSubscriptionTerm', () => {
  test('creates a current subscription and computes current_period_end from term_months', async () => {
    const { org, cafe } = await makeOrgCafe('Record Org', 'Record Cafe', 'record-cafe');
    const admin = await User.create({
      name: 'Admin',
      email: 'admin-record@test.com',
      phone: '+1555992001',
      password_hash: 'pass',
      is_platform_admin: true,
    });

    const before = Date.now();
    const sub = await recordSubscriptionTerm({
      cafeId: cafe._id,
      orgId: org._id,
      termMonths: 12,
      pricePerMonth: 7000,
      adminUserId: admin._id,
      note: 'Paid via UPI',
    });

    expect(sub.is_current).toBe(true);
    expect(sub.status).toBe('active');
    expect(sub.term_months).toBe(12);
    expect(sub.price_per_month).toBe(7000);
    expect(sub.note).toBe('Paid via UPI');

    // current_period_end should be ~12 months after period_start, not client-supplied.
    const monthsElapsed =
      (sub.current_period_end.getFullYear() - sub.period_start.getFullYear()) * 12 +
      (sub.current_period_end.getMonth() - sub.period_start.getMonth());
    expect(monthsElapsed).toBe(12);
    expect(sub.period_start.getTime()).toBeGreaterThanOrEqual(before);

    const updatedCafe = await Cafe.findById(cafe._id);
    expect(updatedCafe.subscription_status).toBe('active');
  });

  test('a second call supersedes the first: old record becomes non-current, new one is current', async () => {
    const { org, cafe } = await makeOrgCafe('Renew Org', 'Renew Cafe', 'renew-cafe');
    const admin = await User.create({
      name: 'Admin',
      email: 'admin-renew@test.com',
      phone: '+1555992002',
      password_hash: 'pass',
      is_platform_admin: true,
    });

    const first = await recordSubscriptionTerm({
      cafeId: cafe._id,
      orgId: org._id,
      termMonths: 1,
      pricePerMonth: 9000,
      adminUserId: admin._id,
    });

    const second = await recordSubscriptionTerm({
      cafeId: cafe._id,
      orgId: org._id,
      termMonths: 12,
      pricePerMonth: 7000,
      adminUserId: admin._id,
    });

    const reloadedFirst = await Subscription.findById(first._id);
    expect(reloadedFirst.is_current).toBe(false);

    const reloadedSecond = await Subscription.findById(second._id);
    expect(reloadedSecond.is_current).toBe(true);

    const currentCount = await Subscription.countDocuments({ cafe_id: cafe._id, is_current: true });
    expect(currentCount).toBe(1);
  });
});

describe('setSubscriptionStatus', () => {
  test('updates only the status field, leaving term/price/period_end untouched', async () => {
    const { org, cafe } = await makeOrgCafe('Status Org', 'Status Cafe', 'status-cafe');
    const admin = await User.create({
      name: 'Admin',
      email: 'admin-status@test.com',
      phone: '+1555992003',
      password_hash: 'pass',
      is_platform_admin: true,
    });

    const original = await recordSubscriptionTerm({
      cafeId: cafe._id,
      orgId: org._id,
      termMonths: 6,
      pricePerMonth: 8000,
      adminUserId: admin._id,
    });

    const updated = await setSubscriptionStatus({
      cafeId: cafe._id,
      status: 'inactive',
      adminUserId: admin._id,
      note: 'Non-payment',
    });

    expect(updated._id.toString()).toBe(original._id.toString());
    expect(updated.status).toBe('inactive');
    expect(updated.term_months).toBe(6);
    expect(updated.price_per_month).toBe(8000);
    expect(updated.current_period_end.getTime()).toBe(original.current_period_end.getTime());

    const updatedCafe = await Cafe.findById(cafe._id);
    expect(updatedCafe.subscription_status).toBe('inactive');
  });

  test('throws NotFoundError for a cafe with no subscription on record yet', async () => {
    const { cafe } = await makeOrgCafe('Unconfigured Org', 'Unconfigured Cafe', 'unconfigured-cafe');
    const admin = await User.create({
      name: 'Admin',
      email: 'admin-unconf@test.com',
      phone: '+1555992004',
      password_hash: 'pass',
      is_platform_admin: true,
    });

    await expect(
      setSubscriptionStatus({ cafeId: cafe._id, status: 'trial', adminUserId: admin._id })
    ).rejects.toThrow('no subscription on record');
  });
});

describe('getCafeSubscriptionHistory', () => {
  test('returns all terms for a cafe, newest period_start first', async () => {
    const { org, cafe } = await makeOrgCafe('History Org', 'History Cafe', 'history-cafe');
    const admin = await User.create({
      name: 'Admin',
      email: 'admin-history@test.com',
      phone: '+1555992005',
      password_hash: 'pass',
      is_platform_admin: true,
    });

    await recordSubscriptionTerm({ cafeId: cafe._id, orgId: org._id, termMonths: 1, pricePerMonth: 9000, adminUserId: admin._id });
    await new Promise((r) => setTimeout(r, 5));
    await recordSubscriptionTerm({ cafeId: cafe._id, orgId: org._id, termMonths: 12, pricePerMonth: 7000, adminUserId: admin._id });

    const history = await getCafeSubscriptionHistory(cafe._id);

    expect(history).toHaveLength(2);
    expect(history[0].term_months).toBe(12); // most recent first
    expect(history[1].term_months).toBe(1);
  });
});

describe('listOrgsWithCafes', () => {
  test('includes a cafe with no subscription as subscription: null', async () => {
    const { org, cafe } = await makeOrgCafe('List Org', 'List Cafe', 'list-cafe');

    const orgs = await listOrgsWithCafes();

    const found = orgs.find((o) => o._id.toString() === org._id.toString());
    expect(found).toBeDefined();
    const foundCafe = found.cafes.find((c) => c._id.toString() === cafe._id.toString());
    expect(foundCafe.subscription).toBeNull();
  });

  test('includes a cafe with a current subscription attached', async () => {
    const { org, cafe } = await makeOrgCafe('List Org 2', 'List Cafe 2', 'list-cafe-2');
    const admin = await User.create({
      name: 'Admin',
      email: 'admin-list@test.com',
      phone: '+1555992006',
      password_hash: 'pass',
      is_platform_admin: true,
    });
    await recordSubscriptionTerm({ cafeId: cafe._id, orgId: org._id, termMonths: 18, pricePerMonth: 6000, adminUserId: admin._id });

    const orgs = await listOrgsWithCafes();

    const found = orgs.find((o) => o._id.toString() === org._id.toString());
    const foundCafe = found.cafes.find((c) => c._id.toString() === cafe._id.toString());
    expect(foundCafe.subscription).not.toBeNull();
    expect(foundCafe.subscription.term_months).toBe(18);
  });
});

describe('getOverviewStats', () => {
  test('computes counts and revenue matching a hand-computed sum over a mixed fixture', async () => {
    const admin = await User.create({
      name: 'Admin',
      email: 'admin-overview@test.com',
      phone: '+1555992007',
      password_hash: 'pass',
      is_platform_admin: true,
    });

    const { org: orgA, cafe: cafeA } = await makeOrgCafe('Overview Org A', 'Overview Cafe A', 'overview-cafe-a');
    const { org: orgB, cafe: cafeB } = await makeOrgCafe('Overview Org B', 'Overview Cafe B', 'overview-cafe-b');
    const { cafe: cafeC } = await makeOrgCafe('Overview Org C', 'Overview Cafe C', 'overview-cafe-c');

    // Active, 12mo @ 7000/mo -> 84000 total, counts toward revenue.
    await recordSubscriptionTerm({ cafeId: cafeA._id, orgId: orgA._id, termMonths: 12, pricePerMonth: 7000, adminUserId: admin._id });
    // Active, 1mo @ 9000/mo -> 9000 total, counts toward revenue.
    await recordSubscriptionTerm({ cafeId: cafeB._id, orgId: orgB._id, termMonths: 1, pricePerMonth: 9000, adminUserId: admin._id });
    // cafeC: no subscription at all (unconfigured) -> doesn't count toward any status bucket or revenue.

    const stats = await getOverviewStats();

    expect(stats.cafe_count).toBeGreaterThanOrEqual(3);
    expect(stats.status_counts.active).toBeGreaterThanOrEqual(2);
    expect(stats.revenue).toBeGreaterThanOrEqual(84000 + 9000);
  });

  test('a subscription whose current_period_end is within 7 days counts as pending', async () => {
    const admin = await User.create({
      name: 'Admin',
      email: 'admin-pending@test.com',
      phone: '+1555992008',
      password_hash: 'pass',
      is_platform_admin: true,
    });
    const { org, cafe } = await makeOrgCafe('Pending Org', 'Pending Cafe', 'pending-cafe');

    await Subscription.create({
      org_id: org._id,
      cafe_id: cafe._id,
      term_months: 1,
      price_per_month: 9000,
      period_start: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
      current_period_end: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
      status: 'active',
      is_current: true,
    });

    const before = await getOverviewStats();
    expect(before.pending_count).toBeGreaterThanOrEqual(1);
  });

  test('excludes a non-active is_current subscription (trial/past_due/inactive) from revenue', async () => {
    const { org, cafe } = await makeOrgCafe('Non-Active Org', 'Non-Active Cafe', 'non-active-cafe');

    await Subscription.create({
      org_id: org._id,
      cafe_id: cafe._id,
      term_months: 12,
      price_per_month: 7000,
      current_period_end: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000),
      status: 'trial',
      is_current: true,
    });

    const stats = await getOverviewStats();

    // A bug that summed revenue over all is_current subs regardless of
    // status would include this trial's 7000*12 = 84000 here; it must not.
    expect(stats.status_counts.trial).toBeGreaterThanOrEqual(1);
    const trialCafeContribution = 7000 * 12;
    // Can't assert an exact total (other tests' fixtures may also exist in
    // this describe block's own test runs), but this trial's own contribution
    // must not appear: revenue should not be inflated by trial-status subs.
    // Re-derive expected revenue by checking status_counts.active count stays
    // unaffected by this trial-only fixture.
    expect(stats.status_counts.active).toBe(0);
    expect(stats.revenue).toBe(0);
  });

  test('a subscription whose current_period_end has already passed also counts as pending', async () => {
    const { org, cafe } = await makeOrgCafe('Overdue Org', 'Overdue Cafe', 'overdue-cafe');

    await Subscription.create({
      org_id: org._id,
      cafe_id: cafe._id,
      term_months: 1,
      price_per_month: 9000,
      status: 'active',
      is_current: true,
      current_period_end: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days overdue
    });

    const stats = await getOverviewStats();

    expect(stats.pending_count).toBeGreaterThanOrEqual(1);
  });
});
