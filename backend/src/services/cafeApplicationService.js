const CafeApplication = require('../models/CafeApplication');
const Cafe = require('../models/Cafe');
const { generateApplicationRef } = require('../utils/applicationRef');
const { logAuditEvent } = require('./auditService');
const {
  requiredName,
  normalizeSlug,
  validateTimezone,
  validateAddress,
} = require('../utils/cafeInput');
const { BadRequestError, ForbiddenError, ConflictError, NotFoundError } = require('../utils/errors');
const { sendCafeApplicationReviewEmail } = require('./emailService');

const REF_ATTEMPTS = 5;

const summarize = (application) =>
  application
    ? {
        id: application._id.toString(),
        application_ref: application.application_ref,
        status: application.status,
        cafe_slug: application.cafe_slug,
        cafe_name: application.cafe_name,
        created_at: application.created_at,
        review_note: application.review_note || '',
      }
    : null;

// The applicant's most recent application, whatever its status — the profile
// card and onboarding screens key off this one record.
const getLatestApplicationSummary = async (userId) => {
  const application = await CafeApplication.findOne({ applicant_user_id: userId }).sort({ created_at: -1 });
  return summarize(application);
};

const validateApplicationInput = (body) => {
  if (!body || typeof body !== 'object') {
    throw new BadRequestError('Application payload is required');
  }
  return {
    organization_name: requiredName(body.organization_name, 'organization_name'),
    cafe_name: requiredName(body.cafe_name, 'cafe_name'),
    cafe_slug: normalizeSlug(body.cafe_slug),
    timezone: validateTimezone(body.timezone),
    address: validateAddress(body.address),
  };
};

// Advisory only. The authoritative check happens inside provisionCafe's
// transaction at approval time, so a race surfaces to the reviewer as a
// clear conflict rather than to the applicant as a silent failure.
const assertSlugAvailable = async (slug) => {
  const [takenByCafe, takenByApplication] = await Promise.all([
    Cafe.exists({ slug }),
    CafeApplication.exists({ cafe_slug: slug, status: 'pending' }),
  ]);
  if (takenByCafe || takenByApplication) {
    throw new BadRequestError('That cafe address is already taken. Please choose another.');
  }
};

const createApplication = async ({ user, body }) => {
  if (!user.is_email_verified) {
    throw new ForbiddenError('Please verify your email address before applying to list a cafe');
  }

  const data = validateApplicationInput(body);
  await assertSlugAvailable(data.cafe_slug);

  let application = null;
  for (let attempt = 0; attempt < REF_ATTEMPTS && !application; attempt += 1) {
    try {
      application = await CafeApplication.create({
        ...data,
        application_ref: generateApplicationRef(),
        applicant_user_id: user._id,
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      // The partial unique index on applicant_user_id fires when the caller
      // already has a pending application; anything else is a reference
      // collision worth one more try.
      if (error?.keyPattern?.applicant_user_id) {
        throw new ConflictError('You already have a cafe application awaiting review');
      }
      if (attempt === REF_ATTEMPTS - 1) throw error;
    }
  }

  await logAuditEvent({
    cafeId: null,
    entityType: 'CafeApplication',
    entityId: application._id,
    action: 'CAFE_APPLICATION_SUBMITTED',
    performedByUserId: user._id,
    afterState: { application_ref: application.application_ref, cafe_slug: application.cafe_slug },
  });

  const summary = summarize(application);
  // Fire-and-forget — same rationale as registerUser: a Resend outage must
  // never fail an application that was otherwise written successfully.
  sendCafeApplicationReviewEmail({
    application: {
      ...summary,
      organization_name: application.organization_name,
      timezone: application.timezone,
      address: application.address.toObject(),
    },
    applicant: { name: user.name, email: user.email, phone: user.phone },
  }).catch((err) => {
    console.error('[cafeApplicationService] Failed to send review email:', err);
  });

  return summary;
};

const withdrawApplication = async (userId) => {
  const application = await CafeApplication.findOne({ applicant_user_id: userId, status: 'pending' });
  if (!application) {
    throw new NotFoundError('No pending cafe application to withdraw');
  }
  application.status = 'withdrawn';
  await application.save();

  await logAuditEvent({
    cafeId: null,
    entityType: 'CafeApplication',
    entityId: application._id,
    action: 'CAFE_APPLICATION_WITHDRAWN',
    performedByUserId: userId,
    afterState: { application_ref: application.application_ref },
  });

  return summarize(application);
};

module.exports = {
  getLatestApplicationSummary,
  summarize,
  createApplication,
  withdrawApplication,
  validateApplicationInput,
};
