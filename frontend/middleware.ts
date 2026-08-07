import { type NextRequest, NextResponse } from "next/server";

/**
 * Middleware handles route protection for the operator dashboard routes.
 * The customer-facing [tenant]/(public) routes are open to all.
 * The [tenant]/(dashboard) routes require an authenticated session cookie.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const sessionCookie =
    request.cookies.get("accessToken") ||
    request.cookies.get("next-auth.session-token") ||
    request.cookies.get("__Secure-next-auth.session-token");

  // Protect Onboarding route
  if (pathname === '/onboarding' && !sessionCookie) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("callbackUrl", "/onboarding");
    return NextResponse.redirect(loginUrl);
  }

  // Match operator dashboard routes: /[tenant]/dashboard, /[tenant]/reservations, etc.
  const isDashboardRoute =
    /^\/[^/]+\/(dashboard|reservations|settings|tables|staff)/.test(pathname);

  if (isDashboardRoute && !sessionCookie) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
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
