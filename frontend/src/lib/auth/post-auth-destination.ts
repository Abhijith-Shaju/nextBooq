import type { AuthUser } from '@/lib/types/auth';
import { getTenantSlugFromHost } from '@/lib/tenant-domain';

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

// middleware.ts builds callbackUrl from the already-rewritten (slug-prefixed)
// pathname, so a callback captured while on a cafe subdomain still names the
// slug explicitly (e.g. "/vtcafe/dashboard") even though the slug is also
// implied by the Host header. Returning that path as-is while still on that
// same subdomain would double-prefix it through middleware's rewrite again.
// This strips exactly that redundant leading "/<slug>" segment, only when it
// matches the subdomain we're actually on.
function stripCurrentSubdomainSlug(path: string, currentSlug: string | null): string {
  if (!currentSlug) return path;
  const prefix = `/${currentSlug}`;
  if (path === prefix) return '/';
  if (path.startsWith(`${prefix}/`)) return path.slice(prefix.length);
  return path;
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

/**
 * `currentHost` is the Host header / window.location.host the login/register
 * page itself was loaded on. If it identifies a cafe subdomain (e.g. staff
 * logging in from vtcafe.nextbooq.in/auth/login), and that's also the cafe
 * this user actually staffs, the destination must NOT be slug-prefixed —
 * the slug is already implied by the host, and prefixing it would make
 * middleware.ts's subdomain rewrite double it (vtcafe.../vtcafe/dashboard),
 * which no route matches. Omitted (or a host that doesn't match any of the
 * user's cafes) preserves the original path-based, slug-prefixed behavior.
 */
export function resolvePostAuthDestination(
  user: AuthUser | null | undefined,
  rawCallbackUrl?: string | null,
  currentHost?: string | null
): string {
  if (!user) return '/';

  const callbackUrl = normalizeSafePath(rawCallbackUrl);
  if (user.is_platform_admin) {
    return callbackUrl && ADMIN_ROUTE.test(callbackUrl) ? callbackUrl : '/admin';
  }

  if (user.owner_org_id) {
    return callbackUrl && ORG_ROUTE.test(callbackUrl) ? callbackUrl : '/org/dashboard';
  }

  const currentSlug = getTenantSlugFromHost(currentHost);

  const memberSlugs = validMembershipSlugs(user);
  if (callbackUrl) {
    const staffMatch = callbackUrl.match(STAFF_ROUTE);
    if (staffMatch && memberSlugs.includes(staffMatch[1])) {
      return stripCurrentSubdomainSlug(callbackUrl, currentSlug);
    }
    if (CUSTOMER_ROUTE.test(callbackUrl)) {
      return stripCurrentSubdomainSlug(callbackUrl, currentSlug);
    }
  }

  const targetSlug = memberSlugs[0];
  if (!targetSlug) return '/';

  return currentSlug === targetSlug ? '/dashboard' : `/${targetSlug}/dashboard`;
}
