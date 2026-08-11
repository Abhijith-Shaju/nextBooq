import { describe, expect, test } from 'vitest';
import { resolveRedirect, isDashboardRoute } from './route-guard';

function makeFakeJwt(payload: Record<string, unknown>): string {
  const base64UrlEncode = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const header = base64UrlEncode({ alg: 'HS256', typ: 'JWT' });
  const body = base64UrlEncode(payload);
  return `${header}.${body}.fakesignature`;
}

const validSessionCookie = () =>
  `accessToken=${makeFakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 })}`;

describe('resolveRedirect', () => {
  test('returns null for an unprotected route with no session', () => {
    expect(resolveRedirect('/mycafe', null)).toBeNull();
  });

  test('redirects /onboarding to login when there is no session', () => {
    expect(resolveRedirect('/onboarding', null)).toEqual({
      redirectTo: '/auth/login',
      callbackUrl: '/onboarding',
    });
  });

  test('returns null for /onboarding when a session cookie is present', () => {
    expect(resolveRedirect('/onboarding', validSessionCookie())).toBeNull();
  });

  test('redirects a tenant dashboard route to login when there is no session', () => {
    expect(resolveRedirect('/mycafe/dashboard', null)).toEqual({
      redirectTo: '/auth/login',
      callbackUrl: '/mycafe/dashboard',
    });
  });

  test('returns null for a tenant dashboard route when a session cookie is present', () => {
    expect(resolveRedirect('/mycafe/reservations', validSessionCookie())).toBeNull();
  });

  test('returns null for the public tenant storefront route with no session', () => {
    expect(resolveRedirect('/mycafe', null)).toBeNull();
  });

  test('redirects /admin to login when there is no session', () => {
    expect(resolveRedirect('/admin', null)).toEqual({
      redirectTo: '/auth/login',
      callbackUrl: '/admin',
    });
  });

  test('returns null for /admin when a session cookie is present', () => {
    expect(resolveRedirect('/admin', validSessionCookie())).toBeNull();
  });
});

describe('isDashboardRoute', () => {
  test.each([
    '/mycafe/dashboard',
    '/mycafe/tables',
    '/mycafe/reservations',
    '/mycafe/settings',
    '/mycafe/staff',
  ])('%s is a dashboard route', (path) => {
    expect(isDashboardRoute(path)).toBe(true);
  });

  test('the public tenant storefront route is not a dashboard route', () => {
    expect(isDashboardRoute('/mycafe')).toBe(false);
  });

  test('the customer booking checkout route is not a dashboard route', () => {
    expect(isDashboardRoute('/mycafe/checkout')).toBe(false);
  });

  test.each(['/admin', '/admin/cafes/123'])('%s is a protected route', (path) => {
    expect(isDashboardRoute(path)).toBe(true);
  });
});
