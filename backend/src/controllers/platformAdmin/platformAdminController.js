const {
  getOverviewStats,
  listOrgsWithCafes,
  getCafeSubscriptionHistory,
  recordSubscriptionTerm,
  setSubscriptionStatus,
} = require('../../services/subscriptionAdminService');
const { BadRequestError } = require('../../utils/errors');

const VALID_TERM_MONTHS = [1, 6, 12, 18];
const VALID_STATUSES = ['trial', 'active', 'past_due', 'inactive'];

const getOverview = async (req, res, next) => {
  try {
    const stats = await getOverviewStats();
    res.status(200).json({ status: 'success', data: stats });
  } catch (error) {
    next(error);
  }
};

const getOrgs = async (req, res, next) => {
  try {
    const orgs = await listOrgsWithCafes();
    res.status(200).json({ status: 'success', data: orgs });
  } catch (error) {
    next(error);
  }
};

const getCafeSubscriptions = async (req, res, next) => {
  try {
    const { cafeId } = req.params;
    const history = await getCafeSubscriptionHistory(cafeId);
    res.status(200).json({ status: 'success', data: history });
  } catch (error) {
    next(error);
  }
};

const postCafeSubscription = async (req, res, next) => {
  try {
    const { cafeId } = req.params;
    const { org_id, term_months, price_per_month, note } = req.body;

    if (!org_id) {
      throw new BadRequestError('org_id is required');
    }
    const termMonths = Number(term_months);
    if (!VALID_TERM_MONTHS.includes(termMonths)) {
      throw new BadRequestError(`term_months must be one of ${VALID_TERM_MONTHS.join(', ')}`);
    }
    const pricePerMonth = Number(price_per_month);
    if (!Number.isFinite(pricePerMonth) || pricePerMonth < 0) {
      throw new BadRequestError('price_per_month must be a non-negative number');
    }

    const subscription = await recordSubscriptionTerm({
      cafeId,
      orgId: org_id,
      termMonths,
      pricePerMonth,
      adminUserId: req.user._id,
      note,
    });

    res.status(201).json({ status: 'success', data: subscription });
  } catch (error) {
    next(error);
  }
};

const patchCafeSubscriptionStatus = async (req, res, next) => {
  try {
    const { cafeId } = req.params;
    const { status, note } = req.body;

    if (!VALID_STATUSES.includes(status)) {
      throw new BadRequestError(`status must be one of ${VALID_STATUSES.join(', ')}`);
    }

    const subscription = await setSubscriptionStatus({
      cafeId,
      status,
      adminUserId: req.user._id,
      note,
    });

    res.status(200).json({ status: 'success', data: subscription });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOverview,
  getOrgs,
  getCafeSubscriptions,
  postCafeSubscription,
  patchCafeSubscriptionStatus,
};
