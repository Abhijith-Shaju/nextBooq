import { hasSessionCookie } from './session';

export interface RedirectDecision {
  redirectTo: string;
  callbackUrl: string;
}

const DASHBOARD_ROUTE_PATTERN = /^\/[^/]+\/(dashboard|reservations|settings|tables|staff)/;

export function resolveRedirect(pathname: string, cookieHeader: string | null): RedirectDecision | null {
  const hasSession = hasSessionCookie(cookieHeader);

  if (pathname === '/onboarding' && !hasSession) {
    return { redirectTo: '/auth/login', callbackUrl: '/onboarding' };
  }

  if (DASHBOARD_ROUTE_PATTERN.test(pathname) && !hasSession) {
    return { redirectTo: '/auth/login', callbackUrl: pathname };
  }

  return null;
}
