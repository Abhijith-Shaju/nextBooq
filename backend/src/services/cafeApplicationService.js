const CafeApplication = require('../models/CafeApplication');

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

module.exports = { getLatestApplicationSummary, summarize };
