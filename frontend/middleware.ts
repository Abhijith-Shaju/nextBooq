import { type NextRequest, NextResponse } from "next/server";

/**
 * Middleware handles route protection for the operator dashboard routes.
 * The customer-facing [tenant]/(public) routes are open to all.
 * The [tenant]/(dashboard) routes require an authenticated session cookie.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Match operator dashboard routes: /[tenant]/dashboard, /[tenant]/settings, etc.
  const isDashboardRoute =
    /^\/[^/]+\/(reservations|settings|tables|staff)/.test(pathname);

  if (isDashboardRoute) {
    const sessionCookie =
      request.cookies.get("next-auth.session-token") ||
      request.cookies.get("__Secure-next-auth.session-token") ||
      request.cookies.get("accessToken");

    if (!sessionCookie) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
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
