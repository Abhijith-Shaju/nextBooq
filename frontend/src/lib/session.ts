import type { QueryClient } from '@tanstack/react-query';
import type { AuthUser } from './types/auth';

// The access token lives only in an httpOnly cookie the backend sets on
// login/register (see backend/src/controllers/authController.js) and clears
// on logout. This module never reads or writes the token itself — that
// would require JS access to it, which is exactly the XSS-exposure this
// design avoids. It only inspects the (non-httpOnly-readable) Cookie header
// Next.js middleware receives server-side, to decide whether a session cookie
// is present, and decodes its payload (without verifying the signature —
// only the backend can authoritatively verify a token) to short-circuit
// obviously-expired sessions for redirect purposes.
const SESSION_COOKIE_NAME = 'accessToken';
const SESSION_COOKIE_PATTERN = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`);

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
  // The session cookie itself was already set by the Set-Cookie header on
  // the login/register response (browser-handled automatically) — this just
  // seeds the client-side user cache from the response body.
  if (authData?.user) {
    queryClient.setQueryData(['me'], authData.user);
  }
  return authData?.user;
}
