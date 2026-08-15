const { ForbiddenError } = require('../utils/errors');
const { getOwnedOrgId } = require('../services/orgOwnershipService');
const { ACTIVE_STAFF_MEMBERSHIP_POPULATE } = require('../utils/authUserResponse');
const User = require('../models/User');

// Gates the /api/v1/org/* namespace. Must run after `authenticate` — it
// re-derives ownership fresh on every request (never trusts the possibly
// stale owner_org_id from the caller's session) and attaches the result as
// req.ownerOrgId for downstream controllers to scope queries by.
const requireOrgOwner = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate(ACTIVE_STAFF_MEMBERSHIP_POPULATE);
    const ownerOrgId = await getOwnedOrgId(user);
    if (!ownerOrgId) {
      throw new ForbiddenError('Organization owner access required');
    }
    req.ownerOrgId = ownerOrgId;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { requireOrgOwner };
