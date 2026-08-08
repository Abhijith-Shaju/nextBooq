import { describe, expect, test } from 'vitest';
import { resolveRedirect } from './route-guard';

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
    expect(resolveRedirect('/onboarding', 'accessToken=jwt-abc123')).toBeNull();
  });

  test('redirects a tenant dashboard route to login when there is no session', () => {
    expect(resolveRedirect('/mycafe/dashboard', null)).toEqual({
      redirectTo: '/auth/login',
      callbackUrl: '/mycafe/dashboard',
    });
  });

  test('returns null for a tenant dashboard route when a session cookie is present', () => {
    expect(resolveRedirect('/mycafe/reservations', 'accessToken=jwt-abc123')).toBeNull();
  });

  test('returns null for the public tenant storefront route with no session', () => {
    expect(resolveRedirect('/mycafe', null)).toBeNull();
  });
});
