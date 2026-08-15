import type { AuthUser } from '@/lib/types/auth';

/**
 * Frontend navigation policy only. This function decides the next browser URL
 * after authentication; it is not an authorization check. Every API and route
 * remains protected by its backend middleware and tenant RBAC.
 */

const ADMIN_ROUTE = /^\/admin(?:\/|$)/;
const ORG_ROUTE = /^\/org(?:\/|$)/;
const STAFF_ROUTE = /^\/([^/?#]+)\/(dashboard|reservations|settings|tables|staff)(?=\/|\?|#|$)/;
const CUSTOMER_ROUTE = /^\/[^/?#]+\/my-reservations(?=\/|\?|#|$)/;
const STAFF_ROLES = new Set(['owner', 'manager', 'host', 'staff']);

function validMembershipSlugs(user: AuthUser): string[] {
  return user.staff_memberships
    .map((membership) => {
      if (!STAFF_ROLES.has(membership.role)) return null;
      const cafe = membership.cafe_id;
      return typeof cafe === 'object' && typeof cafe.slug === 'string' && cafe.slug.length > 0
        ? cafe.slug
        : null;
    })
    .filter((slug): slug is string => slug !== null);
}

function normalizeSafePath(rawCallbackUrl?: string | null): string | null {
  if (!rawCallbackUrl || rawCallbackUrl.length > 2048) return null;
  if (!rawCallbackUrl.startsWith('/') || rawCallbackUrl.startsWith('//')) return null;
  if (/[\\\u0000-\u001F\u007F]/.test(rawCallbackUrl)) return null;

  try {
    const url = new URL(rawCallbackUrl, 'https://nextbooq.local');
    if (url.origin !== 'https://nextbooq.local') return null;
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (url.pathname === '/onboarding' || url.pathname.startsWith('/onboarding/') || url.pathname.startsWith('/auth/')) {
      return null;
    }
    return path;
  } catch {
    return null;
  }
}

export function resolvePostAuthDestination(user: AuthUser | null | undefined, rawCallbackUrl?: string | null): string {
  if (!user) return '/';

  const callbackUrl = normalizeSafePath(rawCallbackUrl);
  if (user.is_platform_admin) {
    return callbackUrl && ADMIN_ROUTE.test(callbackUrl) ? callbackUrl : '/admin';
  }

  if (user.owner_org_id) {
    return callbackUrl && ORG_ROUTE.test(callbackUrl) ? callbackUrl : '/org/dashboard';
  }

  const memberSlugs = validMembershipSlugs(user);
  if (callbackUrl) {
    const staffMatch = callbackUrl.match(STAFF_ROUTE);
    if (staffMatch && memberSlugs.includes(staffMatch[1])) return callbackUrl;
    if (CUSTOMER_ROUTE.test(callbackUrl)) return callbackUrl;
  }

  return memberSlugs[0] ? `/${memberSlugs[0]}/dashboard` : '/';
}
