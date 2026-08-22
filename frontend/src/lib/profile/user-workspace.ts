import { AuthUser } from '@/lib/types/auth';
import { StaffMembership, StaffMembershipCafe } from '@/lib/types/models';

export type ProfileRole = 'owner' | 'manager' | 'guest';

export const PROFILE_ROLE_LABELS: Record<ProfileRole, string> = {
  owner: 'Organization Owner',
  manager: 'Cafe Manager',
  guest: 'Guest',
};

function populatedCafe(membership: StaffMembership): StaffMembershipCafe | null {
  return typeof membership.cafe_id === 'object' ? membership.cafe_id : null;
}

function cafesForRole(user: AuthUser | null | undefined, role: StaffMembership['role']): StaffMembershipCafe[] {
  if (!user) return [];
  return user.staff_memberships
    .filter((membership) => membership.role === role)
    .map(populatedCafe)
    .filter((cafe): cafe is StaffMembershipCafe => cafe !== null);
}

// Org ownership (user.owner_org_id) takes priority over any individual
// manager membership — an org owner still sees the owner view even if they
// also hold a manager role on some other cafe.
export function getProfileRole(user: AuthUser | null | undefined): ProfileRole {
  if (!user) return 'guest';
  if (user.owner_org_id) return 'owner';
  return cafesForRole(user, 'manager').length > 0 ? 'manager' : 'guest';
}

export function getManagerCafes(user: AuthUser | null | undefined): StaffMembershipCafe[] {
  return cafesForRole(user, 'manager');
}

export function getOwnedCafesFromMemberships(user: AuthUser | null | undefined): StaffMembershipCafe[] {
  return cafesForRole(user, 'owner');
}
