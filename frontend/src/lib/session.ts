import type { QueryClient } from '@tanstack/react-query';
import type { AuthUser } from './types/auth';

const SESSION_COOKIE_NAME = 'accessToken';
const SESSION_COOKIE_PATTERN = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`);

const hasBrowserStorage = () =>
  typeof localStorage !== 'undefined' && typeof document !== 'undefined';

export function getToken(): string | null {
  if (!hasBrowserStorage()) return null;
  return localStorage.getItem(SESSION_COOKIE_NAME);
}

export function setSession(token: string): void {
  if (!hasBrowserStorage()) return;
  localStorage.setItem(SESSION_COOKIE_NAME, token);
  const maxAge = 7 * 24 * 60 * 60;
  document.cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export function clearSession(): void {
  if (!hasBrowserStorage()) return;
  localStorage.removeItem(SESSION_COOKIE_NAME);
  document.cookie = `${SESSION_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

export function hasSessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  const match = cookieHeader.match(SESSION_COOKIE_PATTERN);
  return !!match && match[1].length > 0;
}

function decodeJwtPayload(token: string): { exp?: number } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function hasValidSessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  const match = cookieHeader.match(SESSION_COOKIE_PATTERN);
  if (!match || match[1].length === 0) return false;
  const payload = decodeJwtPayload(match[1]);
  if (!payload || typeof payload.exp !== 'number') return false;
  return payload.exp * 1000 > Date.now();
}

export interface AuthResult {
  token?: string;
  user?: AuthUser;
}

export function applyAuthResult(queryClient: QueryClient, authData: AuthResult | undefined): AuthUser | undefined {
  if (authData?.token) {
    setSession(authData.token);
  }
  if (authData?.user) {
    queryClient.setQueryData(['me'], authData.user);
    queryClient.invalidateQueries({ queryKey: ['me'] });
  }
  return authData?.user;
}
