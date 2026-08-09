import { hasValidSessionCookie } from './session';

export interface RedirectDecision {
  redirectTo: string;
  callbackUrl: string;
}

const DASHBOARD_ROUTE_PATTERN = /^\/[^/]+\/(dashboard|reservations|settings|tables|staff)/;

// The single source of truth for "is this a protected staff-dashboard route" —
// reused by the axios 401 interceptor so its redirect allowlist can't drift
// out of sync with the routes this middleware actually protects.
export function isDashboardRoute(pathname: string): boolean {
  return DASHBOARD_ROUTE_PATTERN.test(pathname);
}

export function resolveRedirect(pathname: string, cookieHeader: string | null): RedirectDecision | null {
  const hasSession = hasValidSessionCookie(cookieHeader);

  if (pathname === '/onboarding' && !hasSession) {
    return { redirectTo: '/auth/login', callbackUrl: '/onboarding' };
  }

  if (DASHBOARD_ROUTE_PATTERN.test(pathname) && !hasSession) {
    return { redirectTo: '/auth/login', callbackUrl: pathname };
  }

  return null;
}
