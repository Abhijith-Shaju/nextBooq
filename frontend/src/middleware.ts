import { type NextRequest, NextResponse } from "next/server";
import { resolveRedirect } from "@/lib/route-guard";
import { resolveTenantRewrite } from "@/lib/tenant-domain";

/**
 * Middleware handles two concerns:
 *
 * 1. Tenant subdomains (e.g. blackshores.nextbooq.in) are rewritten to the
 *    equivalent path under the [tenant] dynamic route (/blackshores, or
 *    /blackshores/dashboard, etc.) so the same route tree serves both
 *    nextbooq.in/blackshores and blackshores.nextbooq.in transparently —
 *    the [tenant] layout reads the slug from the (rewritten) URL path
 *    either way, so no other code needs to know which form was used.
 * 2. Route protection for the operator dashboard routes. The customer-facing
 *    [tenant]/(public) routes are open to all. The [tenant]/(dashboard)
 *    routes require an authenticated session cookie.
 *
 * Redirect policy lives in lib/route-guard.ts, and the subdomain-to-path
 * mapping lives in lib/tenant-domain.ts, so both are testable outside the
 * Edge runtime; this file just adapts NextRequest/NextResponse to them.
 *
 * IMPORTANT: this file must live at src/middleware.ts, not at the project
 * root — this app uses a src/ directory, and Next.js silently does not run
 * a root-level middleware.ts in that case (it still gets bundled, which is
 * why "Compiled middleware" appears in dev logs even though it never
 * actually executes on a request). A root-level copy previously sat there
 * inert, so neither this rewrite nor the redirect-to-login behavior below
 * was ever actually enforced by middleware — dashboard route protection
 * only appeared to work because each dashboard layout also has its own
 * redundant client-side auth-guard useEffect.
 */
export function middleware(request: NextRequest) {
  const rewrittenPathname = resolveTenantRewrite(
    request.headers.get("host"),
    request.nextUrl.pathname
  );

  const decision = resolveRedirect(
    rewrittenPathname ?? request.nextUrl.pathname,
    request.headers.get("cookie"),
    request.nextUrl.search
  );

  if (decision) {
    const loginUrl = new URL(decision.redirectTo, request.url);
    loginUrl.searchParams.set("callbackUrl", decision.callbackUrl);
    return NextResponse.redirect(loginUrl);
  }

  if (rewrittenPathname) {
    const url = request.nextUrl.clone();
    url.pathname = rewrittenPathname;
    // Tells [tenant]/layout.tsx (via headers()) that the slug came from the
    // Host header, not the URL — every internal link/redirect built with the
    // slug prefix (tenantPath() in tenant-provider.tsx) needs to know this,
    // or a click while already on a cafe's own subdomain double-prefixes the
    // slug (e.g. vtcafe.localhost/vtcafe/dashboard, which no route matches).
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-tenant-via-subdomain", "1");
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
