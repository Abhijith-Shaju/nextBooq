import { type NextRequest, NextResponse } from "next/server";
import { resolveRedirect } from "@/lib/route-guard";

/**
 * Middleware handles route protection for the operator dashboard routes.
 * The customer-facing [tenant]/(public) routes are open to all.
 * The [tenant]/(dashboard) routes require an authenticated session cookie.
 *
 * Redirect policy lives in lib/route-guard.ts so it's testable outside
 * the Edge runtime; this file just adapts NextRequest/NextResponse to it.
 */
export function middleware(request: NextRequest) {
  const decision = resolveRedirect(
    request.nextUrl.pathname,
    request.headers.get("cookie")
  );

  if (!decision) {
    return NextResponse.next();
  }

  const loginUrl = new URL(decision.redirectTo, request.url);
  loginUrl.searchParams.set("callbackUrl", decision.callbackUrl);
  return NextResponse.redirect(loginUrl);
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
