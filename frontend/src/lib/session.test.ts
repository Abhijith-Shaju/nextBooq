import { afterEach, describe, expect, test, vi } from 'vitest';
import { clearSession, getToken, hasSessionCookie, setSession } from './session';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  clearSession();
});

describe('session', () => {
  test('getToken returns null when nothing is stored', () => {
    expect(getToken()).toBeNull();
  });

  test('getToken returns the token after setSession', () => {
    setSession('jwt-abc123');

    expect(getToken()).toBe('jwt-abc123');
  });

  test('setSession mirrors the token into document.cookie', () => {
    setSession('jwt-abc123');

    expect(document.cookie).toContain('accessToken=jwt-abc123');
  });

  test('clearSession removes the token from storage and the cookie', () => {
    setSession('jwt-abc123');

    clearSession();

    expect(getToken()).toBeNull();
    expect(document.cookie).not.toContain('accessToken=jwt-abc123');
  });

  test('hasSessionCookie is false when the cookie header is null', () => {
    expect(hasSessionCookie(null)).toBe(false);
  });

  test('hasSessionCookie is true when accessToken has a value', () => {
    expect(hasSessionCookie('other=1; accessToken=jwt-abc123; theme=dark')).toBe(true);
  });

  test('hasSessionCookie is false when accessToken is present but empty', () => {
    expect(hasSessionCookie('accessToken=; theme=dark')).toBe(false);
  });

  test('getToken, setSession, and clearSession do not throw when localStorage/document are unavailable (SSR)', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('localStorage', undefined);
    vi.stubGlobal('document', undefined);

    expect(() => getToken()).not.toThrow();
    expect(getToken()).toBeNull();
    expect(() => setSession('jwt-abc123')).not.toThrow();
    expect(() => clearSession()).not.toThrow();
  });
});
