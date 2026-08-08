import { describe, expect, test } from 'vitest';
import { resolveRedirect } from './route-guard';

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
});
