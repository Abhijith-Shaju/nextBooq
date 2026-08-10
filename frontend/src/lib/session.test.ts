import { describe, expect, test } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { applyAuthResult, hasSessionCookie, hasValidSessionCookie } from './session';

function makeFakeJwt(payload: Record<string, unknown>): string {
  const base64UrlEncode = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const header = base64UrlEncode({ alg: 'HS256', typ: 'JWT' });
  const body = base64UrlEncode(payload);
  return `${header}.${body}.fakesignature`;
}

describe('session', () => {
  test('hasSessionCookie is false when the cookie header is null', () => {
    expect(hasSessionCookie(null)).toBe(false);
  });

  test('hasSessionCookie is true when accessToken has a value', () => {
    expect(hasSessionCookie('other=1; accessToken=jwt-abc123; theme=dark')).toBe(true);
  });

  test('hasSessionCookie is false when accessToken is present but empty', () => {
    expect(hasSessionCookie('accessToken=; theme=dark')).toBe(false);
  });

  test('applyAuthResult writes the user into the ["me"] query cache', () => {
    const queryClient = new QueryClient();
    const user = { id: 'u1', name: 'Jane', email: 'jane@example.com' } as any;

    applyAuthResult(queryClient, { token: 'jwt-abc123', user });

    expect(queryClient.getQueryData(['me'])).toEqual(user);
  });

  test('applyAuthResult invalidates the ["me"] query', () => {
    const queryClient = new QueryClient();
    const user = { id: 'u1', name: 'Jane', email: 'jane@example.com' } as any;

    applyAuthResult(queryClient, { token: 'jwt-abc123', user });

    expect(queryClient.getQueryState(['me'])?.isInvalidated).toBe(true);
  });

  test('applyAuthResult returns undefined and does not throw when authData is undefined', () => {
    const queryClient = new QueryClient();

    expect(() => applyAuthResult(queryClient, undefined)).not.toThrow();
    expect(applyAuthResult(queryClient, undefined)).toBeUndefined();
  });

  test('applyAuthResult does not throw when authData has no user (token-only response)', () => {
    const queryClient = new QueryClient();

    expect(() => applyAuthResult(queryClient, { token: 'jwt-abc123' })).not.toThrow();
  });

  test('hasValidSessionCookie is false when the accessToken value is not JWT-shaped', () => {
    expect(hasValidSessionCookie('accessToken=not-a-real-jwt')).toBe(false);
  });

  test('hasValidSessionCookie is false when the token is expired', () => {
    const expiredToken = makeFakeJwt({ exp: Math.floor(Date.now() / 1000) - 3600 });

    expect(hasValidSessionCookie(`accessToken=${expiredToken}`)).toBe(false);
  });

  test('hasValidSessionCookie is true when the token has a future exp', () => {
    const validToken = makeFakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });

    expect(hasValidSessionCookie(`accessToken=${validToken}`)).toBe(true);
  });
});
