# Email Verification

## Problem

nextBooq has no way to confirm a user's email address actually belongs to them. This spec adds a non-blocking email verification flow: a 6-digit code is emailed at registration, and the user can enter it (or request a new one) from a dedicated page whenever they choose. Nothing is gated on verification status yet — accounts work normally whether verified or not.

Out of scope: phone/SMS verification (a separate, later spec, per product decision — email only for now), any banner/nudge UI prompting unverified users to verify (deferred — the mechanism ships first, UI nudges come later once it's clear where they should appear across the different dashboards), and gating any feature/action on verification status (a future decision, not part of this spec).

## Data model

`backend/src/models/User.js` gains three fields:
- `is_email_verified: Boolean` (default `false`).
- `email_verification_code_hash: String` (default `null`) — a SHA-256 hash of the 6-digit code, never the raw code, mirroring how `password_reset_token_hash` never stores the raw reset token.
- `email_verification_expires_at: Date` (default `null`).

`email_verification_code_hash`/`_expires_at` are cleared (`null`) after a successful verification, or overwritten by a newer code request (resend invalidates any prior code — only the most recently issued code is ever valid).

## Code generation and email delivery

A new utility, `backend/src/utils/emailVerification.js`, exports `generateVerificationCode()` returning `{ code: string, codeHash: string, expiresAt: Date }` — a random 6-digit numeric string (`"000000"`–`"999999"`, zero-padded), its SHA-256 hash, and an expiry 15 minutes out — plus `hashVerificationCode(code)` for the standalone hashing used at verification time. This mirrors `backend/src/utils/passwordReset.js`'s shape exactly, adjusted for a numeric code instead of a hex token.

`backend/src/services/emailService.js` gains `sendVerificationEmail({ to, code })`, following the exact same pattern as `sendPasswordResetEmail`: if `RESEND_API_KEY` is unset, log the code to the console instead of sending; otherwise call the Resend SDK, wrapped in try/catch, returning the same `{ logged, data, error }` shape.

## Registration flow change

`registerUser` in `authController.js`, after creating the user (and after the existing `generateToken`/`setAuthCookie`/audit-log steps), generates a verification code via `generateVerificationCode()`, stores its hash + expiry on the new user, and fires `sendVerificationEmail({ to: user.email, code })` without awaiting it (`.catch(err => console.error(...))`) — identical to how `forgotPassword` already fire-and-forgets `sendPasswordResetEmail`. Registration's response, status code, and cookie-setting are entirely unaffected by whether the send succeeds; a user is never blocked from signing up or logging in by email delivery.

## Backend endpoints

Both are mounted under `/api/v1/auth`, both go through `authenticate` (unlike the password-reset endpoints, which are anonymous — verification acts on the *current* logged-in user's own account, so there's no need for a standalone token-in-URL scheme) and `authRateLimiter`.

**`POST /api/v1/auth/verify-email`** — body `{ code }`.
1. If `req.user.is_email_verified` is already `true`, respond `200 { status: 'success', message: 'Your email is already verified.' }` immediately — no code check needed, idempotent.
2. Validate `code` is a present string.
3. Hash the incoming code and compare against `req.user.email_verification_code_hash`, requiring `email_verification_expires_at` to still be in the future — same combined-query pattern as `resetPassword`'s token check.
4. No match (wrong code, expired, or none issued) → `400 BadRequestError('Invalid or expired code.')`.
5. Match → set `is_email_verified = true`, clear both code fields, save. Respond `200 { status: 'success', message: 'Email verified.' }`.

**`POST /api/v1/auth/resend-verification-email`** — no body.
1. If `req.user.is_email_verified` is already `true`, respond `200 { status: 'success', message: 'Your email is already verified.' }` — no new code generated, no email sent.
2. Otherwise, generate a new code (invalidating any prior one), save, fire `sendVerificationEmail` (fire-and-forget, same as registration). Respond `200 { status: 'success', message: 'Verification code sent.' }`.

`is_email_verified` is added to `buildAuthUserPayload` in `authUserResponse.js` (a plain boolean, always present, no new parameters needed since it's read directly off the user document) so the frontend always knows current status from the existing `/auth/me` and login responses.

## Frontend

A new authenticated page, `frontend/src/app/(control-plane)/auth/verify-email/page.tsx`, styled to match the existing auth pages (glass card, `lucide-react` icons):
- If `user.is_email_verified` is already `true` (from `useAuth()`), show a simple "Your email is already verified" state with a link back to the app — no form.
- Otherwise, a 6-digit code input (numeric, `maxLength={6}`) and a submit button calling the new `useVerifyEmail()` hook. On success, show a confirmation. On failure, show an inline error and keep the input so the user can retry.
- A "Didn't get a code? Resend" link/button calling a new `useResendVerificationEmail()` hook, with a brief cooldown-style disabled state while pending (not a hard timer — just disabled during the mutation) to discourage accidental double-sends.

Two new hooks, `frontend/src/hooks/auth/use-verify-email.ts` and `frontend/src/hooks/auth/use-resend-verification-email.ts`, following the same `axiosInstance` + typed-response pattern as `use-forgot-password.ts`/`use-reset-password.ts`.

## Error handling

- Missing/malformed `code` → `400 BadRequestError`, same pattern as every other auth endpoint.
- Wrong/expired/no-code-issued → generic `400`, doesn't distinguish which case (avoids leaking whether a code was ever issued or exactly when it expired).
- Already-verified calls to either endpoint → idempotent `200`, not an error — re-verifying or re-requesting a code for an already-verified account isn't a failure state.
- Resend's email-send failure (Resend API error/outage) → logged server-side only, same as registration; the endpoint still returns its success response, since a delivery failure shouldn't surface as a user-facing error for an operation that already "succeeded" from the server's perspective (a code was generated and an attempt was made).

## Testing

- Backend: integration tests for `verify-email` (correct code flips `is_email_verified` and clears the code fields; wrong code 400; expired code 400; already-verified idempotent 200 without requiring a code) and `resend-verification-email` (issues a new code that invalidates the prior one — verify the old code is rejected after a resend; already-verified idempotent 200, no email service call). Extend the existing `registerUser` test coverage to confirm registration fires `sendVerificationEmail` (mocked) and that registration succeeds/responds normally even when the email service is mocked to reject. A unit test for `generateVerificationCode`/`hashVerificationCode` mirroring `passwordReset.test.js`'s structure.
- Frontend: tests for the new page (already-verified state shown without a form when applicable; code submission calls the mutation with the right payload; success and error states render correctly, with the error state preserving the input for retry; resend button triggers the resend mutation).
