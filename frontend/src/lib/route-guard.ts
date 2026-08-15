import { hasValidSessionCookie } from './session';

export interface RedirectDecision {
  redirectTo: string;
  callbackUrl: string;
}

const DASHBOARD_ROUTE_PATTERN = /^\/[^/]+\/(dashboard|reservations|settings|tables|staff)/;
// The platform-admin surface is a top-level route (not tenant-scoped like
// the pattern above), so it needs its own match — same protection policy
// (redirect to login without a session), different URL shape.
const ADMIN_ROUTE_PATTERN = /^\/admin(\/|$)/;

const isProtectedRoute = (pathname: string): boolean =>
  DASHBOARD_ROUTE_PATTERN.test(pathname) || ADMIN_ROUTE_PATTERN.test(pathname);

// The single source of truth for "is this a protected staff-dashboard route" —
// reused by the axios 401 interceptor so its redirect allowlist can't drift
// out of sync with the routes this middleware actually protects.
export function isDashboardRoute(pathname: string): boolean {
  return isProtectedRoute(pathname);
}

export function resolveRedirect(pathname: string, cookieHeader: string | null, search = ''): RedirectDecision | null {
  const hasSession = hasValidSessionCookie(cookieHeader);

  if (isProtectedRoute(pathname) && !hasSession) {
    return { redirectTo: '/auth/login', callbackUrl: `${pathname}${search}` };
  }

  return null;
}
