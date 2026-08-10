/**
 * Finds a user's staff_membership entry for a given cafe, or null if they have
 * none. Shared by RBAC route middleware and WebSocket room-join authorization
 * so both enforce the exact same tenant-membership rule.
 */
const findStaffMembership = (user, cafeId) => {
  if (!user || !cafeId || !Array.isArray(user.staff_memberships)) {
    return null;
  }
  return (
    user.staff_memberships.find((membership) => membership.cafe_id.toString() === cafeId.toString()) ||
    null
  );
};

module.exports = {
  findStaffMembership,
};
