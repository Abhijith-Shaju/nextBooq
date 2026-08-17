// The apex domain cafe subdomains hang off of. Overridable so preview/staging
// deployments (which don't own nextbooq.in's DNS) can point this at their own
// wildcard-capable domain instead; production defaults to the real one.
const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'nextbooq.in').toLowerCase();

// Routes that exist at the top level of the app (not under the [tenant]
// dynamic segment) and must keep working unprefixed even when reached from a
// cafe's own subdomain — e.g. the "Staff / Operator Login" link on the
// tenant public header points at plain "/auth/login", which must resolve to
// the real login page rather than being rewritten into a nonexistent
// "/<slug>/auth/login" tenant route.
const RESERVED_TOP_LEVEL_PATHS = ['/auth', '/admin', '/org', '/onboarding'];

function isReservedTopLevelPath(pathname: string): boolean {
  return RESERVED_TOP_LEVEL_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Given the incoming request's Host header and pathname, returns the
 * rewritten pathname to route to under the [tenant] dynamic segment if this
 * request is for a cafe subdomain (e.g. blackshores.nextbooq.in), or null if
 * the request should be routed normally (apex domain, www, a reserved
 * top-level path, or a host that isn't a subdomain of ROOT_DOMAIN at all —
 * covers localhost dev and Vercel's own *.vercel.app preview URLs).
 */
export function resolveTenantRewrite(hostHeader: string | null, pathname: string): string | null {
  if (!hostHeader) return null;

  const host = hostHeader.split(':')[0].toLowerCase();
  if (host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`) return null;
  if (!host.endsWith(`.${ROOT_DOMAIN}`)) return null;

  const slug = host.slice(0, -(`.${ROOT_DOMAIN}`.length));
  // A subdomain slug should be a single label (no dots) — anything else
  // (unexpected nested subdomains) isn't a cafe slug this app recognizes.
  if (!slug || slug.includes('.')) return null;

  if (isReservedTopLevelPath(pathname)) return null;

  return pathname === '/' ? `/${slug}` : `/${slug}${pathname}`;
}
