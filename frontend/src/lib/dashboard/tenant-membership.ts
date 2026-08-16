import type { User, StaffMembership } from '@/lib/types/models';

const staffMembershipCafeId = (membership: StaffMembership): string | undefined => {
  const { cafe_id } = membership;
  if (typeof cafe_id === 'string') return cafe_id;
  return cafe_id?.id ?? (cafe_id as { _id?: string })?._id;
};

/**
 * Client-side defense-in-depth: the backend independently enforces tenant
 * membership on every dashboard request (see requirePermission in
 * backend/src/middleware/rbac.js), so this doesn't grant access on its own —
 * it just avoids rendering a staff dashboard shell for a cafe the signed-in
 * user has no relationship to, before every query on the page 403s.
 */
export function hasStaffMembershipForCafe(
  user: Pick<User, 'staff_memberships'> | null | undefined,
  cafeId: string | undefined
): boolean {
  if (!user || !cafeId) return false;
  return user.staff_memberships.some((membership) => staffMembershipCafeId(membership) === cafeId);
}

/**
 * Client-side defense-in-depth (see hasStaffMembershipForCafe above): the
 * backend independently enforces this on every write via requirePermission
 * in backend/src/middleware/rbac.js. This just avoids showing nav links and
 * action buttons for things the signed-in user's role can't do, before the
 * request 403s. An 'owner' membership bypasses the permissions array
 * entirely on the backend, so it does here too.
 */
export function hasCafePermission(
  user: Pick<User, 'staff_memberships'> | null | undefined,
  cafeId: string | undefined,
  permission: string
): boolean {
  if (!user || !cafeId) return false;
  const membership = user.staff_memberships.find((m) => staffMembershipCafeId(m) === cafeId);
  if (!membership) return false;
  if (membership.role === 'owner') return true;
  return membership.permissions.includes(permission);
}
