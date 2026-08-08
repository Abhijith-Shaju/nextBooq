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
