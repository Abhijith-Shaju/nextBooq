// The apex domain cafe subdomains hang off of. Overridable so preview/staging
// deployments (which don't own nextbooq.in's DNS) can point this at their own
// wildcard-capable domain instead; production defaults to the real one.
const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'nextbooq.in').toLowerCase();

// Routes that exist at the top level of the app (not under the [tenant]
// dynamic segment) and must keep working unprefixed even when reached from a
// cafe's own subdomain — e.g. the "Staff / Operator Login" link on the
// tenant public header points at plain "/auth/login", which must resolve to
// the real login page rather than being rewritten into a nonexistent
// "/<slug>/auth/login" tenant route. "/api" is the same story but for XHR:
// every fetch this app makes (including from a tenant subdomain's own pages)
// hits a plain "/api/..." path that next.config.ts's rewrites() proxies to
// the backend — prefixing it with the slug turns it into "/<slug>/api/...",
// which that rewrite rule no longer matches, 404ing every API call made
// while on a cafe subdomain (login, availability, bookings, all of it).
const RESERVED_TOP_LEVEL_PATHS = ['/auth', '/admin', '/org', '/onboarding', '/api'];

function isReservedTopLevelPath(pathname: string): boolean {
  return RESERVED_TOP_LEVEL_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Given a Host header (or window.location.host, which has the same shape),
 * returns the cafe slug it identifies, or null if this host isn't a cafe
 * subdomain at all (apex domain, www, an unrelated host, or a nested
 * subdomain this app doesn't recognize as a single cafe slug). Shared by
 * resolveTenantRewrite (middleware, server-side) and anywhere client code
 * needs the same "is the slug already implied by the Host header" check —
 * e.g. resolvePostAuthDestination deciding whether a post-login redirect
 * needs the slug prefixed or not.
 */
export function getTenantSlugFromHost(hostHeader: string | null | undefined): string | null {
  if (!hostHeader) return null;

  const host = hostHeader.split(':')[0].toLowerCase();
  if (host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`) return null;
  if (!host.endsWith(`.${ROOT_DOMAIN}`)) return null;

  const slug = host.slice(0, -(`.${ROOT_DOMAIN}`.length));
  // A subdomain slug should be a single label (no dots) — anything else
  // (unexpected nested subdomains) isn't a cafe slug this app recognizes.
  if (!slug || slug.includes('.')) return null;

  return slug;
}

/**
 * Builds a link to a specific cafe's page from a context that isn't itself
 * scoped to that cafe (e.g. the org owner dashboard's list of cafes, where
 * each card links to a different cafe's own dashboard). `currentHost` is
 * window.location.host at the time of the click/render.
 *
 * - Not on a cafe subdomain at all (apex, or an unrelated host): the normal
 *   slug-prefixed path, e.g. "/vtcafe/dashboard".
 * - Already on that exact cafe's own subdomain: just the unprefixed path —
 *   prefixing it would double the slug through middleware's rewrite again
 *   (see resolveTenantRewrite), same bug class as buildTenantPath fixes for
 *   links generated from inside the [tenant] tree itself.
 * - On a DIFFERENT cafe's subdomain (an org that owns more than one cafe,
 *   browsing via one of their subdomains): a same-origin relative link
 *   can't reach another cafe's subdomain at all, so this returns a full
 *   absolute URL to the target cafe's own subdomain instead.
 */
export function buildCrossCafeHref(targetSlug: string, path: string, currentHost: string | null | undefined): string {
  const normalized = path === '/' || path === '' ? '' : path.startsWith('/') ? path : `/${path}`;
  const currentSlug = getTenantSlugFromHost(currentHost);

  if (currentSlug === targetSlug) {
    return normalized || '/';
  }

  if (currentSlug && currentHost) {
    const port = currentHost.includes(':') ? `:${currentHost.split(':')[1]}` : '';
    const protocol = ROOT_DOMAIN === 'localhost' || ROOT_DOMAIN.endsWith('.localhost') ? 'http:' : 'https:';
    return `${protocol}//${targetSlug}.${ROOT_DOMAIN}${port}${normalized || '/'}`;
  }

  return `/${targetSlug}${normalized}`;
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
  const slug = getTenantSlugFromHost(hostHeader);
  if (!slug) return null;

  if (isReservedTopLevelPath(pathname)) return null;

  return pathname === '/' ? `/${slug}` : `/${slug}${pathname}`;
}
