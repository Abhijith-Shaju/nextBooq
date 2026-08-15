const mongoose = require('mongoose');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Cafe = require('../models/Cafe');
const Subscription = require('../models/Subscription');
const { logAuditEvent } = require('./auditService');
const { computeCurrentPeriodEnd } = require('./subscriptionAdminService');
const { assertMongoTransactionSupport } = require('../config/mongoTransactionSupport');
const {
  BadRequestError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
} = require('../utils/errors');

const VALID_TERM_MONTHS = [1, 6, 12, 18];
const RESERVED_SLUGS = new Set(['admin', 'api', 'auth', 'onboarding', 'pricing', '_next']);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const asObjectId = (value, field) => {
  if (!mongoose.isValidObjectId(value)) {
    throw new BadRequestError(`${field} must be a valid ObjectId`);
  }
  return new mongoose.Types.ObjectId(value);
};

const requiredName = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestError(`${field} is required`);
  }
  return value.trim();
};

const normalizeSlug = (value) => {
  if (typeof value !== 'string') {
    throw new BadRequestError('cafe.slug is required');
  }
  const slug = value.trim().toLowerCase();
  if (slug.length < 3 || slug.length > 63 || !SLUG_PATTERN.test(slug)) {
    throw new BadRequestError('cafe.slug must be a 3-63 character kebab-case value');
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new BadRequestError('cafe.slug is reserved');
  }
  return slug;
};

const validateTimezone = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestError('cafe.timezone is required');
  }
  const timezone = value.trim();
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch (_) {
    throw new BadRequestError('cafe.timezone must be a valid IANA timezone');
  }
  return timezone;
};

const normalizeSubscription = (value) => {
  if (!value || typeof value !== 'object') {
    throw new BadRequestError('subscription is required');
  }
  const status = value.status;
  if (!['active', 'trial'].includes(status)) {
    throw new BadRequestError('subscription.status must be active or trial');
  }

  if (typeof value.term_months !== 'number' || !Number.isFinite(value.term_months)) {
    throw new BadRequestError('subscription.term_months must be a JSON number');
  }
  if (typeof value.price_per_month !== 'number' || !Number.isFinite(value.price_per_month)) {
    throw new BadRequestError('subscription.price_per_month must be a JSON number');
  }

  const termMonths = value.term_months;
  const pricePerMonth = value.price_per_month;
  if (status === 'trial') {
    if (termMonths !== 1 || pricePerMonth !== 0) {
      throw new BadRequestError('trial subscriptions must be one month at ₹0');
    }
  } else {
    if (!VALID_TERM_MONTHS.includes(termMonths)) {
      throw new BadRequestError(`subscription.term_months must be one of ${VALID_TERM_MONTHS.join(', ')}`);
    }
    if (!Number.isFinite(pricePerMonth) || pricePerMonth < 0) {
      throw new BadRequestError('subscription.price_per_month must be a non-negative number');
    }
  }

  if (value.note !== undefined && typeof value.note !== 'string') {
    throw new BadRequestError('subscription.note must be a string');
  }

  return {
    status,
    termMonths: status === 'trial' ? 1 : termMonths,
    pricePerMonth: status === 'trial' ? 0 : pricePerMonth,
    note: value.note?.trim() || '',
  };
};

const normalizeOrganization = (value) => {
  if (!value || typeof value !== 'object') {
    throw new BadRequestError('organization is required');
  }
  if (value.mode === 'new') {
    return { mode: 'new', name: requiredName(value.name, 'organization.name') };
  }
  if (value.mode === 'existing') {
    return { mode: 'existing', id: asObjectId(value.id, 'organization.id') };
  }
  throw new BadRequestError('organization.mode must be new or existing');
};

const validateProvisionInput = (input) => {
  if (!input || typeof input !== 'object') {
    throw new BadRequestError('Provisioning payload is required');
  }
  if (!input.cafe || typeof input.cafe !== 'object') {
    throw new BadRequestError('cafe is required');
  }

  return {
    ownerUserId: asObjectId(input.owner_user_id, 'owner_user_id'),
    adminUserId: asObjectId(input.adminUserId, 'admin user'),
    organization: normalizeOrganization(input.organization),
    cafe: {
      name: requiredName(input.cafe.name, 'cafe.name'),
      slug: normalizeSlug(input.cafe.slug),
      timezone: validateTimezone(input.cafe.timezone),
    },
    subscription: normalizeSubscription(input.subscription),
  };
};

const userOwnsOrganization = async (owner, organizationId, session) => {
  const ownerCafeIds = owner.staff_memberships
    .filter((membership) => membership.role === 'owner')
    .map((membership) => membership.cafe_id);
  if (!ownerCafeIds.length) return false;

  const ownedCafe = await Cafe.exists({
    _id: { $in: ownerCafeIds },
    org_id: organizationId,
    is_deleted: false,
  }).session(session);
  return Boolean(ownedCafe);
};

const publicSummary = ({ owner, organization, cafe, subscription }) => ({
  owner: { id: owner._id.toString(), name: owner.name, email: owner.email },
  organization: { id: organization._id.toString(), name: organization.name },
  cafe: { id: cafe._id.toString(), name: cafe.name, slug: cafe.slug, timezone: cafe.timezone },
  subscription: {
    id: subscription._id.toString(),
    status: subscription.status,
    term_months: subscription.term_months,
    price_per_month: subscription.price_per_month,
    period_start: subscription.period_start,
    current_period_end: subscription.current_period_end,
    is_current: subscription.is_current,
  },
});

/**
 * The only initial cafe-provisioning write path. This operation fails closed
 * when MongoDB cannot support transactions; it deliberately has no standalone
 * fallback.
 */
const provisionCafe = async (input) => {
  const data = validateProvisionInput(input);

  // This guard must remain directly adjacent to startSession: no provisioning
  // write can occur between topology verification and the transaction boundary.
  await assertMongoTransactionSupport(mongoose.connection);
  const session = await mongoose.startSession();
  let completed = false;

  try {
    session.startTransaction();

    const owner = await User.findById(data.ownerUserId).session(session);
    if (!owner) throw new NotFoundError('Owner user not found');

    let organization;
    if (data.organization.mode === 'new') {
      organization = new Organization({ name: data.organization.name });
      await organization.save({ session });
    } else {
      organization = await Organization.findById(data.organization.id).session(session);
      if (!organization) throw new NotFoundError('Organization not found');
      if (!(await userOwnsOrganization(owner, organization._id, session))) {
        throw new UnprocessableEntityError('Selected owner does not own the selected organization');
      }
    }

    if (await Cafe.exists({ slug: data.cafe.slug }).session(session)) {
      throw new ConflictError('Cafe slug is already in use');
    }

    const cafe = new Cafe({
      org_id: organization._id,
      name: data.cafe.name,
      slug: data.cafe.slug,
      timezone: data.cafe.timezone,
      subscription_status: data.subscription.status,
    });
    await cafe.save({ session });

    const periodStart = new Date();
    const subscription = new Subscription({
      org_id: organization._id,
      cafe_id: cafe._id,
      term_months: data.subscription.termMonths,
      price_per_month: data.subscription.pricePerMonth,
      period_start: periodStart,
      current_period_end: computeCurrentPeriodEnd(periodStart, data.subscription.termMonths),
      status: data.subscription.status,
      is_current: true,
      created_by: data.adminUserId,
      note: data.subscription.note,
    });
    await subscription.save({ session });

    const membershipUpdate = await User.updateOne(
      { _id: owner._id, 'staff_memberships.cafe_id': { $ne: cafe._id } },
      { $push: { staff_memberships: { cafe_id: cafe._id, role: 'owner', permissions: [] } } },
      { session }
    );
    if (membershipUpdate.modifiedCount !== 1) {
      throw new ConflictError('Owner membership could not be created');
    }

    await session.commitTransaction();
    completed = true;

    await logAuditEvent({
      cafeId: cafe._id,
      entityType: 'Cafe',
      entityId: cafe._id,
      action: 'ONBOARD_CAFE',
      performedByUserId: data.adminUserId,
      afterState: {
        owner_user_id: owner._id.toString(),
        organization_id: organization._id.toString(),
        cafe_id: cafe._id.toString(),
        subscription_id: subscription._id.toString(),
        subscription_status: subscription.status,
      },
    });

    return publicSummary({ owner, organization, cafe, subscription });
  } catch (error) {
    if (!completed) {
      try {
        await session.abortTransaction();
      } catch (_) {
        // A failed transaction may already have been aborted by MongoDB.
      }
    }
    // Concurrent transactions can surface as either the unique-slug index
    // collision or MongoDB's transient write-conflict response. The caller
    // gets one consistent retryable conflict instead of an internal error.
    if (
      error?.code === 11000 ||
      error?.code === 112 ||
      error?.codeName === 'WriteConflict' ||
      error?.errorLabels?.includes('TransientTransactionError')
    ) {
      throw new ConflictError('Cafe provisioning conflicted with another request; please retry');
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

module.exports = {
  provisionCafe,
  validateProvisionInput,
};
