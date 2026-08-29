const {
  getOverviewStats,
  listOrgsWithCafes,
  getReservationsNeedingManualRefund,
  getCafeSubscriptionHistory,
  recordSubscriptionTerm,
  setSubscriptionStatus,
} = require('../../services/subscriptionAdminService');
const { BadRequestError } = require('../../utils/errors');
const User = require('../../models/User');
const { provisionCafe } = require('../../services/cafeProvisioningService');
const {
  listApplications,
  getApplicationDetail,
  approveApplication,
  rejectApplication,
} = require('../../services/cafeApplicationService');

const VALID_TERM_MONTHS = [1, 6, 12, 18];
const VALID_STATUSES = ['trial', 'active', 'past_due', 'inactive'];

const normalizeLookupEmail = (email) => {
  if (typeof email !== 'string' || !email.trim()) {
    throw new BadRequestError('email is required');
  }
  return email.trim().toLowerCase();
};

const getOwnerLookup = async (req, res, next) => {
  try {
    const email = normalizeLookupEmail(req.query.email);
    const user = await User.findOne({ email })
      .populate({
        path: 'staff_memberships.cafe_id',
        match: { is_deleted: false },
        select: 'name slug timezone org_id',
        populate: { path: 'org_id', select: 'name' },
      });
    if (!user) {
      const { NotFoundError } = require('../../utils/errors');
      throw new NotFoundError('User not found');
    }

    const memberships = user.staff_memberships
      .filter((membership) => membership.cafe_id)
      .map((membership) => ({
        role: membership.role,
        cafe: {
          id: membership.cafe_id._id.toString(),
          name: membership.cafe_id.name,
          slug: membership.cafe_id.slug,
          organization: membership.cafe_id.org_id ? {
            id: membership.cafe_id.org_id._id.toString(),
            name: membership.cafe_id.org_id.name,
          } : null,
        },
      }));
    const organizations = new Map();
    for (const membership of memberships) {
      if (membership.role === 'owner' && membership.cafe.organization) {
        organizations.set(membership.cafe.organization.id, membership.cafe.organization);
      }
    }

    res.status(200).json({
      status: 'success',
      data: {
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          staff_memberships: memberships,
          owned_organizations: [...organizations.values()],
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const postProvisionCafe = async (req, res, next) => {
  try {
    const data = await provisionCafe({ ...req.body, adminUserId: req.user._id });
    res.status(201).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

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

const getRefundsNeeded = async (req, res, next) => {
  try {
    const reservations = await getReservationsNeedingManualRefund();
    res.status(200).json({ status: 'success', data: reservations });
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
    if (typeof term_months !== 'number' || !Number.isFinite(term_months)) {
      throw new BadRequestError('term_months must be a JSON number');
    }
    const termMonths = term_months;
    if (!VALID_TERM_MONTHS.includes(termMonths)) {
      throw new BadRequestError(`term_months must be one of ${VALID_TERM_MONTHS.join(', ')}`);
    }
    if (typeof price_per_month !== 'number' || !Number.isFinite(price_per_month)) {
      throw new BadRequestError('price_per_month must be a JSON number');
    }
    const pricePerMonth = price_per_month;
    if (pricePerMonth < 0) {
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

const getCafeApplications = async (req, res, next) => {
  try {
    const applications = await listApplications({ status: req.query.status });
    res.status(200).json({ status: 'success', data: applications });
  } catch (error) {
    next(error);
  }
};

const getCafeApplication = async (req, res, next) => {
  try {
    const application = await getApplicationDetail(req.params.id);
    res.status(200).json({ status: 'success', data: application });
  } catch (error) {
    next(error);
  }
};

const postApproveCafeApplication = async (req, res, next) => {
  try {
    const result = await approveApplication({
      applicationId: req.params.id,
      adminUserId: req.user._id,
      subscription: req.body.subscription,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};

const postRejectCafeApplication = async (req, res, next) => {
  try {
    const application = await rejectApplication({
      applicationId: req.params.id,
      adminUserId: req.user._id,
      note: req.body.note,
    });
    res.status(200).json({ status: 'success', data: application });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOwnerLookup,
  postProvisionCafe,
  getOverview,
  getOrgs,
  getRefundsNeeded,
  getCafeSubscriptions,
  postCafeSubscription,
  patchCafeSubscriptionStatus,
  getCafeApplications,
  getCafeApplication,
  postApproveCafeApplication,
  postRejectCafeApplication,
};
