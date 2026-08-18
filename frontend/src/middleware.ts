import { type NextRequest, NextResponse } from "next/server";
import { resolveRedirect } from "@/lib/route-guard";

/**
 * Route protection for the operator dashboard routes. The customer-facing
 * [tenant]/(public) routes are open to all. The [tenant]/(dashboard) routes
 * require an authenticated session cookie. Redirect policy lives in
 * lib/route-guard.ts so it's testable outside the Edge runtime; this file
 * just adapts NextRequest/NextResponse to it.
 *
 * IMPORTANT: this file must live at src/middleware.ts, not at the project
 * root — this app uses a src/ directory, and Next.js silently does not run
 * a root-level middleware.ts in that case (it still gets bundled, which is
 * why "Compiled middleware" appears in dev logs even though it never
 * actually executes on a request).
 */
export function middleware(request: NextRequest) {
  const decision = resolveRedirect(
    request.nextUrl.pathname,
    request.headers.get("cookie"),
    request.nextUrl.search
  );

  if (decision) {
    const loginUrl = new URL(decision.redirectTo, request.url);
    loginUrl.searchParams.set("callbackUrl", decision.callbackUrl);
    return NextResponse.redirect(loginUrl);
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
