/**
 * Auth Token Manager
 * Manages JWT tokens in both document.cookie and localStorage so that:
 * 1. Next.js Edge Middleware can inspect session cookies for protected route redirects.
 * 2. Axios instance can send `Authorization: Bearer <token>` on client side API requests.
 */

export const TOKEN_COOKIE_NAME = 'accessToken';

export const setAuthToken = (token: string) => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(TOKEN_COOKIE_NAME, token);
      // 7 days expiration matching JWT server expiry
      const maxAge = 7 * 24 * 60 * 60;
      document.cookie = `${TOKEN_COOKIE_NAME}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax`;
    } catch (e) {
      console.error('Failed to set auth token:', e);
    }
  }
};

export const getAuthToken = (): string | null => {
  if (typeof window === 'undefined') return null;

  try {
    const localToken = localStorage.getItem(TOKEN_COOKIE_NAME);
    if (localToken) return localToken;

    const match = document.cookie.match(new RegExp(`(?:^|; )${TOKEN_COOKIE_NAME}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  } catch (e) {
    return null;
  }
};

export const removeAuthToken = () => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(TOKEN_COOKIE_NAME);
      document.cookie = `${TOKEN_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
    } catch (e) {
      console.error('Failed to remove auth token:', e);
    }
  }
};
