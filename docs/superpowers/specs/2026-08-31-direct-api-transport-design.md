# Direct API Transport — Design

**Date:** 2026-08-31
**Status:** Approved, ready for implementation planning

## Summary

Browser API calls currently reach the backend through a Next.js rewrite:
`/api/:path*` on the Vercel origin is proxied server-side to
`https://api.nextbooq.in`. Every such request therefore arrives at the backend
*from Vercel*, so `req.ip` is a Vercel egress address for every user and all
IP-keyed rate limiting collapses into one shared bucket.

This design points the browser at `api.nextbooq.in` directly. Because that host
and `www.nextbooq.in` share a registrable domain, the session cookie can be
scoped to `.nextbooq.in` and keep working — including for the Next.js
middleware that reads it for route protection — while the backend finally sees
the real client IP through nginx's `X-Forwarded-For`.

## Goals

- IP-keyed rate limiters bucket per end user rather than per proxy.
- The Next.js middleware continues to see the session cookie and protect routes.
- No weakening of the current CSRF posture.
- One request path to the API, not two.

## Non-goals (deliberately deferred)

- Rate-limit **key** hardening (keying auth limiters on the submitted email
  alongside IP). Worth doing; a separate concern.
- Simplifying the socket-token handshake. With the cookie readable at
  `.nextbooq.in` the short-lived-token dance becomes unnecessary, but the token
  approach is arguably more secure and touches real-time infrastructure.
- Any change to authentication logic, session lifetime, or JWT contents. This
  changes *transport and cookie scope only*.

## Current state (verified)

Measured against production on 2026-08-31, not inferred:

- **The topology is** browser → Vercel → nginx 1.24 (on the EC2 host) → Node on
  port 8000. Single static IP; no ALB, no Cloudflare.
- **nginx is correctly configured** — it sets `X-Forwarded-For`, `X-Real-IP`
  and `X-Forwarded-Proto`, and terminates TLS via Certbot.
- **`TRUST_PROXY=1` is set and working.** Three consecutive direct requests to
  `api.nextbooq.in` decremented one bucket cleanly (`28 → 27 → 26`), proving
  both that XFF is honoured and that the app runs as a single process (no
  cluster-mode bucket splitting).
- **The two paths are keyed differently.** A direct request and a
  Vercel-proxied request to the same endpoint each reported
  `RateLimit-Remaining: 29` — separate buckets. Had they shared a key, the
  second would have read 28. This is the defect.
- **The browser already talks to `api.nextbooq.in` cross-origin** for
  socket.io (`frontend/src/app/[tenant]/(dashboard)/layout.tsx`), which works
  around the cookie problem by fetching a short-lived token over the proxied
  REST API. The precedent — and the documented awareness of the issue — already
  exists in the codebase.
- **Server-side fetches are unaffected.** `[tenant]/layout.tsx` resolves tenant
  data server-to-server via `NEXT_PUBLIC_API_URL`; no cookie, no CORS.
- **The cookie name appears in exactly five places** across
  `authController.js` (2), `middleware/auth.js` (2) and `lib/session.ts` (1).

## Decisions and rationale

### D1. Point the browser directly at `api.nextbooq.in`

Rejected alternatives:

- **Forward the client IP in a custom header through the rewrite.** Any
  header-based scheme must be paired with stripping that header from
  non-Vercel sources, or an attacker hitting `api.nextbooq.in` directly forges
  it and evades limits entirely. More moving parts, worse failure mode.
- **Change what the limiters key on instead.** Useful defence in depth (see
  Non-goals) but not a substitute: it cannot stop distributed abuse the way
  real per-IP limiting does.

### D2. Scope the cookie to `.nextbooq.in` via a `COOKIE_DOMAIN` env var

The Next.js middleware reads the session cookie on the Vercel origin to decide
route protection. A cookie set host-only by `api.nextbooq.in` would never be
sent to `www.nextbooq.in`, and every protected route would bounce to login —
which is precisely why the rewrite exists today.

The domain comes from **`COOKIE_DOMAIN`**, a new optional env var, rather than
being hardcoded: unset locally (host-only, correct for `localhost`),
`.nextbooq.in` in production. Hardcoding a production domain in source would
make local development a special case in the code rather than in config.

### D3. Rename the cookie `accessToken` → `nb_session`

A `.nextbooq.in` cookie and the existing host-only `accessToken` on
`www.nextbooq.in` would share a name; browsers send both and the server picks
one arbitrarily, producing intermittent auth failures that are painful to
reproduce.

With no production users yet this is polish rather than risk mitigation, and
the product owner chose to keep it anyway: it removes the failure mode during
the team's own testing, and `nb_session` describes the thing better than
`accessToken` does — it is a session cookie, not an OAuth access token.

### D4. Remove the rewrite rather than keep it as a fallback

Two paths to the same API means requests taking the proxied path silently keep
the broken rate limiting, with nothing to signal which path a given request
took. Removing it also forces any unnoticed dependency on same-origin to
surface in review rather than in production.

### D5. Transport only

No change to authentication logic, rate-limit keys, or the socket handshake.
This touches a live auth path; the smallest reviewable change is the right one.

## Changes

### Backend

| File | Change |
| --- | --- |
| `src/controllers/authController.js` | `setAuthCookie` and `clearAuthCookie`: cookie name → `nb_session`, add `domain: config.COOKIE_DOMAIN \|\| undefined`. **Both must carry identical attributes** or `clearCookie` silently fails to clear. |
| `src/middleware/auth.js` | Read `req.cookies?.nb_session` (two references). |
| `src/config/env.js` | New `COOKIE_DOMAIN: z.string().optional()`. No production assertion — unset is valid (host-only). |

### Frontend

| File | Change |
| --- | --- |
| `src/lib/session.ts` | `SESSION_COOKIE_NAME = 'nb_session'`. |
| `src/hooks/api/axios-instance.ts` | `baseURL: process.env.NEXT_PUBLIC_API_URL ?? ''`. |
| `next.config.ts` | Delete the `/api/:path*` rewrite. |
| Comments | `axios-instance.ts`, `next.config.ts`, `session.ts` and the socket block in `app/[tenant]/(dashboard)/layout.tsx` all currently explain why the proxy exists. They become actively misleading and must be corrected, not deleted. |

### Deployment configuration (not code)

On EC2: `COOKIE_DOMAIN=.nextbooq.in` and
`CORS_ALLOWED_ORIGINS=https://www.nextbooq.in,https://nextbooq.in`.
`NEXT_PUBLIC_API_URL` on Vercel is already `https://api.nextbooq.in` and needs
no change.

## Security posture

**CSRF protection is preserved.** `SameSite=Lax` keys on *site*, not origin.
`www.nextbooq.in` → `api.nextbooq.in` is same-site, so the cookie is sent;
`evil.com` → `api.nextbooq.in` is cross-site, so it is not. Nothing is given
up by the move to cross-origin requests.

**CORS becomes load-bearing.** Today browser calls are same-origin and the
allowlist barely matters. Afterwards, `CORS_ALLOWED_ORIGINS` plus
`credentials: true` is what stands between a malicious origin and authenticated
reads. It fails closed — a wrong value breaks the app loudly rather than
leaking — but it must be correct in production.

**Accepted trade-off:** a `.nextbooq.in` cookie is readable by *any* subdomain.
This is fine today, but it means untrusted or third-party content must never be
hosted on a `nextbooq.in` subdomain (a `blog.` or `status.` running someone
else's software would be able to read session cookies).

## Deployment

Deploy the backend first, then the frontend. With no production users the
ordering is a convenience rather than a requirement, but backend-first
degrades more gracefully: during the gap the old frontend still proxies and
still looks for `accessToken`, so users appear logged in and their API calls
401 into the existing redirect-to-login interceptor. Frontend-first would fail
every request at the CORS preflight instead.

Everyone currently signed in is logged out at deploy. This is expected and was
accepted: the cookie name and scope both change, so no existing session
survives.

## Testing

**Backend:**

- `authenticate` accepts a `nb_session` cookie and does **not** accept
  `accessToken`.
- Login sets the cookie with `httpOnly`, `sameSite=lax`, `secure` in
  production, and the configured `domain`.
- Logout clears it with matching attributes — the guard against the
  attribute-mismatch bug that makes `clearCookie` a no-op.
- With `COOKIE_DOMAIN` unset, the cookie is host-only (the local-development
  guard).
- The `Authorization: Bearer` path is untouched and still works.

**Frontend:**

- `session.ts` recognises `nb_session` and not `accessToken`, for both
  `hasSessionCookie` and `hasValidSessionCookie`.
- `route-guard` behaviour is unchanged.
- axios targets `NEXT_PUBLIC_API_URL` when set and stays relative when not.
- The existing verify-email isolation tests and the cafe-onboarding suite must
  pass **untouched** — they are the regression net for this auth path.

## Acceptance criteria

The change is only proven by the measurement that exposed the defect. After
deploy, issue one request straight to `api.nextbooq.in` and one from a browser
on `www.nextbooq.in`, and compare `RateLimit-Remaining`:

- **Today:** both report the same number — separate buckets.
- **Required afterwards:** the counter decrements across both — one bucket,
  keyed on the real client IP.

A successful login through the browser must also survive a page reload (the
cookie is being sent to `api.nextbooq.in`) and grant access to a protected
route (the middleware on the Vercel origin can still see it).

## Rollback

Vercel instant-rollback to the previous deployment, `git revert` the backend
commit, restart Node. No schema change, no data migration, nothing to
un-migrate. Users are logged out a second time and nothing else is lost.

## Follow-ups (not in this change)

- Key the login / register / forgot-password limiters on the submitted email
  alongside IP, so one account cannot be hammered from many addresses.
- Retire the socket-token handshake now that the cookie is readable at
  `.nextbooq.in`, if that simplification is judged worth the change to
  real-time auth.
- The repo has no ESLint config, so `npm run lint` cannot run. Unrelated to
  this change but it means any spec requiring lint to pass is unverifiable.
