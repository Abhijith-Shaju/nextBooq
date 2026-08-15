# Forgot Password Flow

## Problem

nextBooq has no way for a user who forgets their password to regain access — there's no reset flow, no email-sending infrastructure at all, and no reset-related fields on `User`. This spec adds a standard "forgot password" email-link flow, plus the minimal email-sending infrastructure it needs.

Out of scope: phone/email verification (a separate, later spec), any other transactional email (welcome emails, receipts, etc.) — this spec builds only what the reset flow needs, not a general-purpose notification system.

## Email delivery

New `backend/src/services/emailService.js` wraps the Resend SDK with a single function, `sendPasswordResetEmail({ to, resetUrl })`. Two new env vars in `config/env.js`'s zod schema: `RESEND_API_KEY` (optional) and `FROM_EMAIL` (optional, defaults to a placeholder like `nextBooq <onboarding@resend.dev>` for local/test use). If `RESEND_API_KEY` is unset, the service logs the reset URL to the console instead of calling the Resend API — this keeps local dev and the test suite working without a real API key or network call.

## Data model

`backend/src/models/User.js` gains two optional fields:
- `password_reset_token_hash: String` (default `null`) — a SHA-256 hash of the raw reset token, never the raw token itself (mirrors how `password_hash` never stores a raw password).
- `password_reset_expires_at: Date` (default `null`).

Both are cleared (`null`) after a successful reset, or overwritten by a newer request — only the most recently requested token is ever valid, and each token works exactly once.

## Backend endpoints

Both live in `authController.js` / `authRoutes.js`, alongside the existing login/register/logout handlers.

**`POST /api/v1/auth/forgot-password`** — body `{ email }`.
1. Validate `email` is present and a string.
2. Look up the user by (lowercased, trimmed) email.
3. If found: generate a random 32-byte token (`crypto.randomBytes(32).toString('hex')`), store its SHA-256 hash and an expiry of `now + 30 minutes` on the user, save, then call `sendPasswordResetEmail` with a reset URL of `${FRONTEND_URL}/auth/reset-password?token=<raw-token>`.
4. Whether or not a user was found, respond identically: `{ status: 'success', message: 'If an account exists for that email, a reset link has been sent.' }`. This is the account-enumeration defense — a client can never tell from the response whether the email is registered. (An audit event is logged only in the found-user case, matching the existing `LOGIN_FAILED`/`LOGIN` pattern in `authController.js`.)
5. Rate-limited using the same `rateLimiter.js` middleware already applied to `/auth/login`, to blunt spam/enumeration-via-timing and mailbox-bombing.

**`POST /api/v1/auth/reset-password`** — body `{ token, password }`.
1. Validate both fields are present strings; run the new password through the existing `assertPasswordStrength` (min 8 chars) already used by `registerUser`.
2. Hash the incoming `token` (SHA-256) and look up a user whose `password_reset_token_hash` matches AND whose `password_reset_expires_at` is still in the future.
3. No match (wrong token, expired, or already used) → `400 BadRequestError('This reset link is invalid or has expired.')`.
4. Match → hash the new password (bcrypt, same as `registerUser`), set `password_hash`, clear both `password_reset_token_hash` and `password_reset_expires_at`, save. Respond `{ status: 'success', message: 'Password updated. You can now log in.' }`. Does not auto-login the user — they go back to the login page, consistent with resetting credentials being a deliberate re-authentication event.
5. An audit event (`PASSWORD_RESET`) is logged on success, same shape as the existing `LOGIN`/`REGISTER` events.

A new `FRONTEND_URL` env var (optional, defaults to `http://localhost:3000` for local dev) is added so the backend can build an absolute reset URL without hardcoding the frontend's origin.

## Frontend pages

Two new pages under `frontend/src/app/(control-plane)/auth/`, styled to match the existing `login/page.tsx` and `register/page.tsx` (same card layout, same `lucide-react` icon-in-input pattern):

- **`forgot-password/page.tsx`** — a single email field and a submit button. On submit, calls the new endpoint and always shows the same generic confirmation message (e.g. "If an account exists for that email, we've sent a reset link") regardless of the API response content, reinforcing the enumeration defense on the client side too. A "Back to login" link.
- **`reset-password/page.tsx`** — reads `token` from the URL query string (`useSearchParams`, same pattern as the existing `callbackUrl` handling in `login/page.tsx`). Shows a new-password field (reusing the same show/hide toggle just added to login/register) and a submit button. On success, shows a confirmation and a link to `/auth/login`. On a 400 (invalid/expired token), shows an inline error explaining the link no longer works and a link back to `/auth/forgot-password` to request a new one. If the page loads with no `token` in the URL at all, it shows the same "invalid link" state immediately without calling the API.

The existing login page gets a small addition: a "Forgot password?" link near the password field, pointing to `/auth/forgot-password`.

## Error handling

- Missing/malformed `email` or `password`/`token` → `400 BadRequestError`, same pattern as every other auth endpoint.
- Non-existent email on `forgot-password` → generic success response (see above), not a 404 — this is deliberate, not an oversight.
- Invalid/expired/reused token on `reset-password` → `400 BadRequestError`, generic message (doesn't distinguish "expired" from "already used" from "never existed," which would leak information about token validity/timing).
- Resend API failure (network error, invalid key) inside `sendPasswordResetEmail` → logged server-side, but the `forgot-password` endpoint still returns its generic success response to the client (an email delivery failure shouldn't reveal account existence or leak infrastructure errors to the caller). This is a deliberate trade-off: a real delivery failure is invisible to the requesting user, but visible in server logs for operators to catch.

## Testing

- Backend: integration tests for `forgot-password` (existing email → user gains a token hash + expiry and the email service is invoked; non-existent email → identical response shape, no email service call) and `reset-password` (valid token → password actually changes and old password no longer works; expired token → 400; reused token → 400 on the second attempt; malformed token → 400). A unit test for the token-hashing/expiry-matching logic if it's factored into its own function.
- Frontend: tests for both new pages (form submission calls the right endpoint with the right payload; generic message always shown on `forgot-password` regardless of mocked response; `reset-password` handles present/absent/invalid token states; the new "Forgot password?" link exists on the login page).
