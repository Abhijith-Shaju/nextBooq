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

  test('hasSessionCookie is true when nb_session has a value', () => {
    expect(hasSessionCookie('other=1; nb_session=jwt-abc123; theme=dark')).toBe(true);
  });

  test('hasSessionCookie is false when nb_session is present but empty', () => {
    expect(hasSessionCookie('nb_session=; theme=dark')).toBe(false);
  });

  test('hasSessionCookie ignores a legacy accessToken cookie', () => {
    // The rename is a clean cut: a stale accessToken left in a browser from
    // before the change must not read as a live session, or the middleware
    // would wave the user through to a route whose API calls all 401.
    expect(hasSessionCookie('accessToken=jwt-abc123')).toBe(false);
  });

  test('applyAuthResult writes the user into the ["me"] query cache', () => {
    const queryClient = new QueryClient();
    const user = { id: 'u1', name: 'Jane', email: 'jane@example.com' } as any;

    applyAuthResult(queryClient, { token: 'jwt-abc123', user });

    expect(queryClient.getQueryData(['me'])).toEqual(user);
  });

  test('applyAuthResult keeps the response-seeded ["me"] query fresh', () => {
    const queryClient = new QueryClient();
    const user = { id: 'u1', name: 'Jane', email: 'jane@example.com' } as any;

    applyAuthResult(queryClient, { token: 'jwt-abc123', user });

    expect(queryClient.getQueryState(['me'])?.isInvalidated).toBe(false);
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

  test('hasValidSessionCookie is true for an unexpired nb_session', () => {
    const token = makeFakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(hasValidSessionCookie(`nb_session=${token}`)).toBe(true);
  });

  test('hasValidSessionCookie is false for an expired nb_session', () => {
    const token = makeFakeJwt({ exp: Math.floor(Date.now() / 1000) - 3600 });
    expect(hasValidSessionCookie(`nb_session=${token}`)).toBe(false);
  });

  test('hasValidSessionCookie ignores a legacy accessToken cookie', () => {
    const token = makeFakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(hasValidSessionCookie(`accessToken=${token}`)).toBe(false);
  });
});
