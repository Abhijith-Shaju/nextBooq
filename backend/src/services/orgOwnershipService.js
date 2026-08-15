const Cafe = require('../models/Cafe');

// Derives org ownership from staff_memberships rather than storing it: a
// user "owns" an org when they hold the `owner` role on every one of that
// org's non-deleted cafes. Expects `user.staff_memberships.cafe_id` to
// already be populated with at least { _id, org_id } and filtered to
// non-deleted cafes (see ACTIVE_STAFF_MEMBERSHIP_POPULATE in
// authUserResponse.js) — unpopulated (ObjectId) entries are skipped.
const getOwnedOrgId = async (user) => {
  const ownedCafeCountByOrgId = new Map();

  for (const membership of user.staff_memberships) {
    if (membership.role !== 'owner') continue;
    const cafe = membership.cafe_id;
    if (!cafe || typeof cafe !== 'object' || !cafe.org_id) continue;

    const orgIdStr = cafe.org_id.toString();
    ownedCafeCountByOrgId.set(orgIdStr, (ownedCafeCountByOrgId.get(orgIdStr) || 0) + 1);
  }

  for (const [orgIdStr, ownedCount] of ownedCafeCountByOrgId) {
    const totalCafeCount = await Cafe.countDocuments({ org_id: orgIdStr, is_deleted: false });
    if (totalCafeCount > 0 && totalCafeCount === ownedCount) {
      return orgIdStr;
    }
  }

  return null;
};

module.exports = { getOwnedOrgId };
