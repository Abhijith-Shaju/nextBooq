const Organization = require('../models/Organization');
const Cafe = require('../models/Cafe');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { NotFoundError } = require('../utils/errors');

const PENDING_WINDOW_DAYS = 7;

// JS Date month-arithmetic note: setMonth() on the 29th-31st of a month can
// roll into the following month if the target month is shorter (e.g. Jan 31
// + 1 month -> Mar 3, skipping Feb). Acceptable here: this is an
// admin-recorded, non-time-critical billing date, not a scheduling primitive.
const computeCurrentPeriodEnd = (periodStart, termMonths) => {
  const end = new Date(periodStart);
  end.setMonth(end.getMonth() + termMonths);
  return end;
};

const syncCafeStatus = async (cafeId, status) => {
  await Cafe.updateOne({ _id: cafeId }, { $set: { subscription_status: status } });
};

const getOverviewStats = async () => {
  const [orgCount, cafeCount, currentSubs] = await Promise.all([
    Organization.countDocuments({}),
    Cafe.countDocuments({ is_deleted: false }),
    Subscription.find({ is_current: true }),
  ]);

  const statusCounts = { trial: 0, active: 0, past_due: 0, inactive: 0 };
  let revenue = 0;
  let pendingCount = 0;
  const pendingThreshold = new Date(Date.now() + PENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  for (const sub of currentSubs) {
    statusCounts[sub.status] = (statusCounts[sub.status] || 0) + 1;
    if (sub.status === 'active') {
      revenue += sub.price_per_month * sub.term_months;
    }
    if (sub.current_period_end <= pendingThreshold) {
      pendingCount += 1;
    }
  }

  return {
    org_count: orgCount,
    cafe_count: cafeCount,
    status_counts: statusCounts,
    pending_count: pendingCount,
    revenue,
  };
};

const listOrgsWithCafes = async () => {
  const [orgs, cafes, currentSubs] = await Promise.all([
    Organization.find({}).sort({ name: 1 }).lean(),
    Cafe.find({ is_deleted: false })
      .sort({ name: 1 })
      .select('-payments.razorpay_key_secret_encrypted -payments.razorpay_webhook_secret_encrypted')
      .lean(),
    Subscription.find({ is_current: true }).lean(),
  ]);

  const subByCafeId = new Map(currentSubs.map((sub) => [sub.cafe_id.toString(), sub]));

  const cafeIds = cafes.map((cafe) => cafe._id);
  const owners = await User.find(
    { 'staff_memberships.cafe_id': { $in: cafeIds }, 'staff_memberships.role': 'owner' },
    'name email phone staff_memberships'
  ).lean();

  const ownerByCafeId = new Map();
  for (const user of owners) {
    for (const membership of user.staff_memberships) {
      if (membership.role !== 'owner') continue;
      const cafeIdStr = membership.cafe_id.toString();
      if (!ownerByCafeId.has(cafeIdStr)) {
        ownerByCafeId.set(cafeIdStr, { name: user.name, email: user.email, phone: user.phone });
      }
    }
  }

  const cafesByOrgId = new Map();
  for (const cafe of cafes) {
    const orgIdStr = cafe.org_id.toString();
    if (!cafesByOrgId.has(orgIdStr)) cafesByOrgId.set(orgIdStr, []);
    cafesByOrgId.get(orgIdStr).push({
      ...cafe,
      subscription: subByCafeId.get(cafe._id.toString()) || null,
      owner: ownerByCafeId.get(cafe._id.toString()) || null,
    });
  }

  return orgs.map((org) => ({
    ...org,
    cafes: cafesByOrgId.get(org._id.toString()) || [],
  }));
};

const getCafeSubscriptionHistory = async (cafeId) => {
  return Subscription.find({ cafe_id: cafeId }).sort({ period_start: -1 });
};

const recordSubscriptionTerm = async ({ cafeId, orgId, termMonths, pricePerMonth, adminUserId, note }) => {
  const periodStart = new Date();
  const currentPeriodEnd = computeCurrentPeriodEnd(periodStart, termMonths);

  await Subscription.updateMany(
    { cafe_id: cafeId, is_current: true },
    { $set: { is_current: false } }
  );

  const subscription = await Subscription.create({
    org_id: orgId,
    cafe_id: cafeId,
    term_months: termMonths,
    price_per_month: pricePerMonth,
    period_start: periodStart,
    current_period_end: currentPeriodEnd,
    status: 'active',
    is_current: true,
    created_by: adminUserId,
    note: note || '',
  });

  await syncCafeStatus(cafeId, 'active');

  return subscription;
};

const setSubscriptionStatus = async ({ cafeId, status, adminUserId, note }) => {
  const current = await Subscription.findOne({ cafe_id: cafeId, is_current: true });
  if (!current) {
    throw new NotFoundError(
      'This cafe has no subscription on record yet — record a plan term first'
    );
  }

  current.status = status;
  if (note !== undefined) current.note = note;
  await current.save();

  await syncCafeStatus(cafeId, status);

  return current;
};

module.exports = {
  computeCurrentPeriodEnd,
  getOverviewStats,
  listOrgsWithCafes,
  getCafeSubscriptionHistory,
  recordSubscriptionTerm,
  setSubscriptionStatus,
};
