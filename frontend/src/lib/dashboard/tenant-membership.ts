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
