# Auth Security Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five specific, bounded auth bugs found in the ruthless auth-flow review — a live unauthenticated account-takeover, no rate limiting, a middleware session check that trusts an empty string, no audit trail of auth events, and a too-weak JWT signing secret — each isolated to one red→green TDD cycle.

**Architecture:** No new architecture. Every task edits code that already exists (`authController.js`, `session.ts`, `route-guard.ts`, `authRoutes.js`, `env.js`, `AuditLog.js`) and follows patterns already established in this codebase this session (Vitest for frontend `lib/` modules, Jest+Supertest+`mongodb-memory-server` for backend integration tests).

**Tech Stack:** Backend: Node/Express 5, Mongoose 9, bcryptjs, jsonwebtoken, Jest 30, Supertest 7. Frontend: Next.js 15 (Edge Middleware), TypeScript, Vitest 4, `@tanstack/react-query` 5.

## Global Constraints

- Package manager is npm. Backend and frontend are separate `package.json`s (`backend/`, `frontend/`).
- Never commit with `--no-verify`. Never use `git commit --amend` unless told to.
- Run the *full* existing test suite for the package you touched after every task, not just the new test — regressions in unrelated tests block the task.
- Backend tests use an in-memory MongoDB replica set (`mongodb-memory-server`, `backend/tests/setup.js`) and mock Razorpay via `jest.mock('../../src/config/razorpay', ...)` in files that hit reservation/payment endpoints. Auth-only tests don't need the Razorpay mock.
- Frontend Vitest config (`frontend/vitest.config.ts`) already sets `pool: 'threads'` — the default `forks` pool fails to spawn workers on this machine's Windows path (contains spaces). Do not remove that setting.
- `frontend/src/lib/session.ts` is imported by client-bundled code (hooks, providers) — never add a reference to a server-only secret (e.g. `JWT_SECRET`) inside it. Anything that needs a secret belongs in a module only `middleware.ts` imports, or must avoid needing a secret at all (this plan's Task 3 uses the latter: decode-only, no signature verification, so no secret is needed anywhere in `session.ts`).
- Every task ends with a commit. Follow this repo's existing commit style: a one-line summary, a blank line, then a short paragraph explaining *why*, ending with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

## Excluded from this plan (bigger than a bug fix — do not attempt here)

These were findings in the same review but are architecture/feature-level changes, not bounded bug fixes:

- **Moving the JWT out of `localStorage`/client-readable cookies into a server-set `HttpOnly` cookie.** Changes the whole request-auth transport (axios's `Authorization: Bearer` attachment, CSRF posture, Edge Middleware's read path). Needs its own plan.
- **Email/phone verification (OTP).** New infrastructure (email/SMS sending, verification tokens). Not a bug fix.
- **Splitting `User` into distinct customer/staff identities with a `role`/`account_type` field.** A schema migration touching every auth endpoint, the JWT payload, and RBAC. Needs its own plan.
- **Consolidating `CustomerAuthModal` and `AuthOverlay` into one component.** Already identified as its own architecture-review candidate (Candidate 3, "worth exploring") — a UI refactor, not a security bug fix. Not duplicated here.
- **Password reset / account recovery flow.** Does not exist at all today, for anyone. New feature.
  - **Important dependency this plan creates:** Task 1 makes `customer-quick-auth` correctly refuse to silently log a caller into an existing account when no password is supplied. A genuine returning guest who used quick-auth on a prior visit *without* setting a password (the UI already allowed this) has no way to know the auto-generated password `GuestPass_<timestamp>` their account was created with, and — after Task 1 — no way to re-authenticate through this endpoint either. They are not compromised, but they are locked out until a password-reset flow exists. This is the correct trade: silently authenticating anyone who knows an email address is worse than a returning guest needing a reset flow that doesn't exist yet. Flag this to the user after Task 1 lands.
- **JWT/session revocation on logout.** Stateless JWT with no blacklist is a legitimate, common tradeoff; building revocation is a real feature (needs a store, needs every authenticated request to check it). Not attempted here.
- **Multi-membership account picker.** Silently picking `staff_memberships[0]` is a UX gap, not a security bug. Small feature, not in scope.

## File Structure

- Modify: `backend/src/controllers/authController.js` — Task 1 (fix the vulnerable branch), Task 4 (add audit logging calls)
- Modify: `backend/tests/integration/customerAuth.test.js` — Task 1 (new test cases for the fixed endpoint)
- Modify: `frontend/src/components/booking/auth-overlay.tsx` — Task 1 (stop labeling the password field as universally optional)
- Create: `backend/src/middleware/rateLimiter.js` — Task 2
- Modify: `backend/src/routes/v1/authRoutes.js` — Task 2 (apply the limiter)
- Create: `backend/tests/integration/authRateLimit.test.js` — Task 2
- Modify: `backend/package.json` — Task 2 (new dependency `express-rate-limit`)
- Modify: `frontend/src/lib/session.ts` — Task 3 (new `hasValidSessionCookie`)
- Modify: `frontend/src/lib/session.test.ts` — Task 3
- Modify: `frontend/src/lib/route-guard.ts` — Task 3 (use the new function)
- Modify: `frontend/src/lib/route-guard.test.ts` — Task 3 (update two fixtures that used a fake non-JWT cookie value)
- Modify: `backend/src/models/AuditLog.js` — Task 4 (`cafe_id` becomes optional — auth events have no cafe)
- Create: `backend/tests/integration/authAuditLog.test.js` — Task 4
- Modify: `backend/src/config/env.js` — Task 5 (export `envSchema`, raise `JWT_SECRET` minimum to 32)
- Create: `backend/tests/unit/env.test.js` — Task 5

---

### Task 1: Close the customer-quick-auth passwordless account takeover

**Files:**
- Modify: `backend/src/controllers/authController.js:163-168`
- Modify: `backend/tests/integration/customerAuth.test.js` (append tests inside the existing top-level `describe`)
- Modify: `frontend/src/components/booking/auth-overlay.tsx:204-219`

**Interfaces:**
- Consumes: nothing new — `UnauthorizedError` is already imported at the top of `authController.js` (`const { BadRequestError, UnauthorizedError } = require('../utils/errors');`).
- Produces: `POST /api/v1/auth/customer-quick-auth` now returns `401` when `email` or `phone` matches an existing `User` and `password` is omitted or wrong. Behavior for a genuinely new email/phone (no existing user) is unchanged — still creates the account without requiring a password.

The current vulnerable code, for reference (do not copy — you're replacing it):

```js
    } else if (password) {
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        throw new UnauthorizedError('Invalid password for existing customer account');
      }
    }
```

When `user` already exists and `password` is falsy, this branch is skipped entirely and execution falls through to `generateToken(user._id)` two lines later — anyone who knows a registered email or phone gets a valid token for that account with zero verification.

- [ ] **Step 1: Write the failing test — existing account, no password, must be rejected**

Open `backend/tests/integration/customerAuth.test.js`. Insert this test inside the existing `describe('Customer Authentication & Reservation Integration Tests', () => { ... })` block, after the last test (`'Customer holds reservation and populates CafeCustomer rolodex record'`), before the block's closing `});`:

```js
  test('customer-quick-auth rejects an existing account when no password is provided', async () => {
    // First call creates the account with a real password.
    await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({
        name: 'Carol Guest',
        email: 'carol@example.com',
        phone: '+18885551111',
        password: 'CarolsRealPassword1!',
      });

    // A second caller who only knows the email/phone, and omits the password,
    // must NOT be able to log in as Carol.
    const res = await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({
        name: 'Someone Else',
        email: 'carol@example.com',
        phone: '+19998887777',
      });

    expect(res.statusCode).toEqual(401);
    expect(res.body.data).toBeUndefined();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/integration/customerAuth.test.js -t "rejects an existing account" --runInBand`

Expected: FAIL — the current code returns `200` with a valid token, not `401`.

- [ ] **Step 3: Fix the vulnerable branch**

In `backend/src/controllers/authController.js`, replace lines 163-168:

```js
    } else if (password) {
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        throw new UnauthorizedError('Invalid password for existing customer account');
      }
    }
```

with:

```js
    } else {
      if (!password) {
        throw new UnauthorizedError(
          'An account with this email or phone already exists. Please provide your password to continue.'
        );
      }
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        throw new UnauthorizedError('Invalid password for existing customer account');
      }
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest tests/integration/customerAuth.test.js -t "rejects an existing account" --runInBand`

Expected: PASS

- [ ] **Step 5: Add a regression test — existing account, correct password, still works**

Append inside the same `describe` block:

```js
  test('customer-quick-auth logs in an existing account when the correct password is provided', async () => {
    await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({
        name: 'Dave Guest',
        email: 'dave@example.com',
        phone: '+18885552222',
        password: 'DavesRealPassword1!',
      });

    const res = await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({
        name: 'Dave Guest',
        email: 'dave@example.com',
        phone: '+18885552222',
        password: 'DavesRealPassword1!',
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toEqual('dave@example.com');
  });
```

Run: `cd backend && npx jest tests/integration/customerAuth.test.js -t "correct password" --runInBand`

Expected: PASS (this confirms the fix didn't break the legitimate path — it was already correct before Step 3, so this test is a regression guard, not one that drove new code).

- [ ] **Step 6: Add a regression test — existing account, wrong password, still rejected with the original message**

Append inside the same `describe` block:

```js
  test('customer-quick-auth rejects an existing account when the wrong password is provided', async () => {
    await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({
        name: 'Erin Guest',
        email: 'erin@example.com',
        phone: '+18885553333',
        password: 'ErinsRealPassword1!',
      });

    const res = await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({
        name: 'Erin Guest',
        email: 'erin@example.com',
        phone: '+18885553333',
        password: 'TotallyWrongPassword!',
      });

    expect(res.statusCode).toEqual(401);
    expect(res.body.message).toMatch(/invalid password/i);
  });
```

Run: `cd backend && npx jest tests/integration/customerAuth.test.js -t "wrong password" --runInBand`

Expected: PASS

- [ ] **Step 7: Add a regression test — brand-new email/phone, no password, still creates an account**

This is the legitimate "quick, passwordless guest checkout" path this endpoint exists for. It must still work for accounts that don't already exist. Append inside the same `describe` block:

```js
  test('customer-quick-auth creates a brand-new account when no password is provided', async () => {
    const res = await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({
        name: 'Frank NewGuest',
        email: 'frank@example.com',
        phone: '+18885554444',
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toEqual('frank@example.com');
  });
```

Run: `cd backend && npx jest tests/integration/customerAuth.test.js -t "brand-new account" --runInBand`

Expected: PASS

- [ ] **Step 8: Stop the frontend from advertising the password as universally optional**

The vulnerability was directly reachable through `AuthOverlay` (the booking-flow guest-checkout form), whose label told users the password was optional even when submitting an email that might already have an account. In `frontend/src/components/booking/auth-overlay.tsx`, find (around lines 204-219):

```tsx
              <div>
                <Label className="text-xs font-semibold text-brand-brown flex items-center justify-between">
                  <span>Create Password (Optional)</span>
                  <span className="text-[10px] text-brand-mocha">Saves profile</span>
                </Label>
                <div className="relative mt-1">
                  <Lock className="w-4 h-4 text-brand-mocha absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <Input
                    type="password"
                    placeholder="Create a password for instant future bookings"
                    value={guestPassword}
                    onChange={(e) => setGuestPassword(e.target.value)}
                    className="pl-10 h-11 text-sm rounded-xl border-brand-brown/20 focus:border-brand-red focus:ring-brand-red/20"
                  />
                </div>
              </div>
```

Replace the `Label` contents and the input's `placeholder`:

```tsx
              <div>
                <Label className="text-xs font-semibold text-brand-brown flex items-center justify-between">
                  <span>Password</span>
                  <span className="text-[10px] text-brand-mocha">Required if you've booked with us before</span>
                </Label>
                <div className="relative mt-1">
                  <Lock className="w-4 h-4 text-brand-mocha absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <Input
                    type="password"
                    placeholder="Leave blank if this is your first time here"
                    value={guestPassword}
                    onChange={(e) => setGuestPassword(e.target.value)}
                    className="pl-10 h-11 text-sm rounded-xl border-brand-brown/20 focus:border-brand-red focus:ring-brand-red/20"
                  />
                </div>
              </div>
```

No test needed for this step — it's a copy-only change. The existing `catch` block in `AuthOverlay`'s `handleHoldReservation` (`toast.error(err?.response?.data?.message || err?.message || 'Authentication failed')`) already surfaces the backend's new 401 message verbatim, so no other frontend logic changes.

- [ ] **Step 9: Run the full backend test suite**

Run: `cd backend && npm test`

Expected: All suites pass, including the four new/modified tests above and every pre-existing test (state machine, allocation engine, RBAC, subscription enforcement, webhook idempotency, OCC conflict, concurrency, e2e lifecycle).

- [ ] **Step 10: Commit**

```bash
git add backend/src/controllers/authController.js backend/tests/integration/customerAuth.test.js frontend/src/components/booking/auth-overlay.tsx
git commit -m "$(cat <<'EOF'
Fix passwordless account takeover in customer-quick-auth

customer-quick-auth matched an existing user by email or phone and, when
no password was supplied, fell straight through to issuing a valid JWT
with zero verification — anyone who knew a registered customer's email or
phone could authenticate as that account. AuthOverlay (the booking-flow
guest-checkout form) made this worse by labeling the password field
"(Optional)", actively steering users into the vulnerable path.

Now requires a password whenever an existing account matches, rejecting
with 401 if it's missing or wrong. New-account creation (the intended
passwordless quick-checkout path) is unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Rate-limit the auth endpoints

**Files:**
- Create: `backend/src/middleware/rateLimiter.js`
- Modify: `backend/src/routes/v1/authRoutes.js`
- Create: `backend/tests/integration/authRateLimit.test.js`
- Modify: `backend/package.json` (new dependency)

**Interfaces:**
- Consumes: nothing new.
- Produces: `authRateLimiter` — an Express middleware, exported from `backend/src/middleware/rateLimiter.js` as `{ authRateLimiter }`. Applied to `POST /register`, `POST /login`, `POST /customer-quick-auth` in `authRoutes.js`.

- [ ] **Step 1: Install the dependency**

Run: `cd backend && npm install express-rate-limit`

- [ ] **Step 2: Write the failing test**

Create `backend/tests/integration/authRateLimit.test.js`:

```js
const request = require('supertest');
const app = require('../../src/app');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Integration Test: Auth Endpoint Rate Limiting', () => {
  test('blocks the 21st login attempt from the same client within the rate-limit window', async () => {
    const credentials = { email: 'nobody@example.com', password: 'wrong-password' };

    for (let i = 0; i < 20; i++) {
      const res = await request(app).post('/api/v1/auth/login').send(credentials);
      expect(res.status).not.toBe(429);
    }

    const blockedRes = await request(app).post('/api/v1/auth/login').send(credentials);
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.message).toMatch(/too many/i);
  }, 20000);
});
```

Note: this file intentionally contains only one test. `express-rate-limit`'s default store counts by IP across every route the middleware is applied to, and every `supertest` request in this process originates from the same address — a second test in this file would inherit the first test's count and produce a flaky/incorrect result.

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd backend && npx jest tests/integration/authRateLimit.test.js --runInBand`

Expected: FAIL — all 21 requests currently return `401` (bad credentials), none return `429`, so `blockedRes.status` is `401` and the `toBe(429)` assertion fails.

- [ ] **Step 4: Create the rate limiter middleware**

Create `backend/src/middleware/rateLimiter.js`:

```js
const rateLimit = require('express-rate-limit');

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'fail',
    statusCode: 429,
    message: 'Too many authentication attempts. Please try again later.',
  },
});

module.exports = { authRateLimiter };
```

- [ ] **Step 5: Apply it to the auth routes**

In `backend/src/routes/v1/authRoutes.js`, the current content is:

```js
const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  getMe,
  logoutUser,
  customerQuickAuth,
} = require('../../controllers/authController');
const { authenticate } = require('../../middleware/auth');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/customer-quick-auth', customerQuickAuth);
router.get('/me', authenticate, getMe);
router.post('/logout', logoutUser);

module.exports = router;
```

Replace it with:

```js
const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  getMe,
  logoutUser,
  customerQuickAuth,
} = require('../../controllers/authController');
const { authenticate } = require('../../middleware/auth');
const { authRateLimiter } = require('../../middleware/rateLimiter');

router.post('/register', authRateLimiter, registerUser);
router.post('/login', authRateLimiter, loginUser);
router.post('/customer-quick-auth', authRateLimiter, customerQuickAuth);
router.get('/me', authenticate, getMe);
router.post('/logout', logoutUser);

module.exports = router;
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend && npx jest tests/integration/authRateLimit.test.js --runInBand`

Expected: PASS

- [ ] **Step 7: Run the full backend test suite**

Run: `cd backend && npm test`

Expected: All suites pass. Only `backend/tests/integration/customerAuth.test.js` calls the real auth HTTP endpoints — every other integration/e2e test file constructs tokens directly via `jwt.sign(...)` and never hits `/login`, `/register`, or `/customer-quick-auth`. `customerAuth.test.js` makes 9 calls to `customer-quick-auth` total (including the 4 tests Task 1 added) and 0 to `/login` or `/register` — well under the 20-request limit, so no existing test should trip the new limiter. If something unexpectedly does, that's a real signal worth stopping on rather than raising `max` to paper over it.

- [ ] **Step 8: Commit**

```bash
git add backend/src/middleware/rateLimiter.js backend/src/routes/v1/authRoutes.js backend/tests/integration/authRateLimit.test.js backend/package.json backend/package-lock.json
git commit -m "$(cat <<'EOF'
Rate-limit auth endpoints

register, login, and customer-quick-auth had no throttling — combined
with the customer-quick-auth vulnerability fixed in the previous commit,
this made account enumeration and credential stuffing fully automatable
with no friction. Caps each client to 20 requests per 15-minute window
across all three auth endpoints.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Middleware must check the session cookie is a valid, unexpired token — not just non-empty

**Files:**
- Modify: `frontend/src/lib/session.ts`
- Modify: `frontend/src/lib/session.test.ts`
- Modify: `frontend/src/lib/route-guard.ts`
- Modify: `frontend/src/lib/route-guard.test.ts`

**Interfaces:**
- Consumes: nothing new. Does **not** need `JWT_SECRET` — this checks the token's *shape* and its `exp` claim by decoding the payload, without verifying the signature. Real authorization already happens at the backend on every API call; this only improves the accuracy of the frontend's redirect decision. (Full signature verification would need `jose` and a server-only secret, kept out of `session.ts` per the Global Constraints — that's a larger change, not attempted here.)
- Produces: `hasValidSessionCookie(cookieHeader: string | null): boolean`, exported from `session.ts` alongside the existing `hasSessionCookie` (which is left as-is — it's still accurate for what its name says, "has *a* session cookie"). `route-guard.ts`'s `resolveRedirect` switches from calling `hasSessionCookie` to calling `hasValidSessionCookie`.

- [ ] **Step 1: Write the failing test — malformed token is not a valid session**

In `frontend/src/lib/session.test.ts`, add this import at the top alongside the existing ones:

```ts
import { applyAuthResult, clearSession, getToken, hasSessionCookie, hasValidSessionCookie, setSession } from './session';
```

(This replaces the existing import line that lists `applyAuthResult, clearSession, getToken, hasSessionCookie, setSession` — just add `hasValidSessionCookie` to that same list.)

Then append this test inside the existing `describe('session', () => { ... })` block, after the last test:

```ts
  test('hasValidSessionCookie is false when the accessToken value is not JWT-shaped', () => {
    expect(hasValidSessionCookie('accessToken=not-a-real-jwt')).toBe(false);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/session.test.ts`

Expected: FAIL — `hasValidSessionCookie` is not exported yet.

- [ ] **Step 3: Write the minimal implementation**

In `frontend/src/lib/session.ts`, add this after the existing `hasSessionCookie` function (which stays unchanged):

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/session.test.ts`

Expected: PASS

- [ ] **Step 5: Add a test helper and a slice for expired tokens**

At the top of `frontend/src/lib/session.test.ts`, after the imports, add this helper (it builds a string shaped like a JWT — three dot-separated base64url segments — without needing a real signing library, since `hasValidSessionCookie` never checks the signature):

```ts
function makeFakeJwt(payload: Record<string, unknown>): string {
  const base64UrlEncode = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const header = base64UrlEncode({ alg: 'HS256', typ: 'JWT' });
  const body = base64UrlEncode(payload);
  return `${header}.${body}.fakesignature`;
}
```

Then append this test inside the `describe` block:

```ts
  test('hasValidSessionCookie is false when the token is expired', () => {
    const expiredToken = makeFakeJwt({ exp: Math.floor(Date.now() / 1000) - 3600 });

    expect(hasValidSessionCookie(`accessToken=${expiredToken}`)).toBe(false);
  });
```

Run: `cd frontend && npx vitest run src/lib/session.test.ts`

Expected: PASS immediately — `decodeJwtPayload` already checks `exp`, this confirms the existing implementation generalizes rather than driving new code. Note this transparently rather than claiming a red step that didn't happen.

- [ ] **Step 6: Add the true-case slice**

Append inside the `describe` block:

```ts
  test('hasValidSessionCookie is true when the token has a future exp', () => {
    const validToken = makeFakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });

    expect(hasValidSessionCookie(`accessToken=${validToken}`)).toBe(true);
  });
```

Run: `cd frontend && npx vitest run src/lib/session.test.ts`

Expected: PASS (also confirms existing logic, no new code driven — same as Step 5).

- [ ] **Step 7: Wire route-guard.ts to the new function**

In `frontend/src/lib/route-guard.ts`, change:

```ts
import { hasSessionCookie } from './session';
```

to:

```ts
import { hasValidSessionCookie } from './session';
```

And change the one call site inside `resolveRedirect`:

```ts
  const hasSession = hasSessionCookie(cookieHeader);
```

to:

```ts
  const hasSession = hasValidSessionCookie(cookieHeader);
```

- [ ] **Step 8: Fix the two route-guard tests that now use an invalid fake token**

`frontend/src/lib/route-guard.test.ts` has two tests that pass `'accessToken=jwt-abc123'` as a "session present" cookie header — that string isn't JWT-shaped, so after Step 7 it no longer counts as a valid session and both tests will fail. Add the same `makeFakeJwt` helper used in Step 5 to the top of this file (after the imports):

```ts
function makeFakeJwt(payload: Record<string, unknown>): string {
  const base64UrlEncode = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const header = base64UrlEncode({ alg: 'HS256', typ: 'JWT' });
  const body = base64UrlEncode(payload);
  return `${header}.${body}.fakesignature`;
}

const validSessionCookie = () =>
  `accessToken=${makeFakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 })}`;
```

Then find these two existing tests:

```ts
  test('returns null for /onboarding when a session cookie is present', () => {
    expect(resolveRedirect('/onboarding', 'accessToken=jwt-abc123')).toBeNull();
  });
```

```ts
  test('returns null for a tenant dashboard route when a session cookie is present', () => {
    expect(resolveRedirect('/mycafe/reservations', 'accessToken=jwt-abc123')).toBeNull();
  });
```

and replace the hardcoded cookie string in each with a call to the new helper:

```ts
  test('returns null for /onboarding when a session cookie is present', () => {
    expect(resolveRedirect('/onboarding', validSessionCookie())).toBeNull();
  });
```

```ts
  test('returns null for a tenant dashboard route when a session cookie is present', () => {
    expect(resolveRedirect('/mycafe/reservations', validSessionCookie())).toBeNull();
  });
```

- [ ] **Step 9: Run the full frontend test suite**

Run: `cd frontend && npm test`

Expected: All tests in `session.test.ts` and `route-guard.test.ts` pass.

- [ ] **Step 10: Typecheck**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/lib/session.ts frontend/src/lib/session.test.ts frontend/src/lib/route-guard.ts frontend/src/lib/route-guard.test.ts
git commit -m "$(cat <<'EOF'
Middleware now checks the session cookie is valid, not just present

hasSessionCookie (and the resolveRedirect policy built on it) only checked
the accessToken cookie was non-empty. An expired token, or a garbage
string, still passed the gate and let the dashboard shell render before
the first API call 401'd. Adds hasValidSessionCookie, which decodes the
JWT payload (no signature check — that needs a server-only secret this
module can't hold, since it's imported by client-bundled code too) and
confirms it's shaped like a JWT with an unexpired exp claim.
hasSessionCookie is left as-is for anything that only needs "is there a
cookie at all."

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Audit-log register, login, and customer-quick-auth events

**Files:**
- Modify: `backend/src/models/AuditLog.js`
- Modify: `backend/src/controllers/authController.js`
- Create: `backend/tests/integration/authAuditLog.test.js`

**Interfaces:**
- Consumes: `logAuditEvent({ cafeId, entityType, entityId, action, beforeState, afterState, performedByUserId })` from `backend/src/services/auditService.js` — already exists, already used by `tableController.js`. `cafeId` will now be passed as `null` for auth events, which requires relaxing `AuditLog.cafe_id`'s `required: true`.
- Produces: an `AuditLog` document with `cafe_id: null`, `entity_type: 'User'`, `entity_id: <user._id>`, `action: 'REGISTER' | 'LOGIN' | 'CUSTOMER_QUICK_AUTH'`, `performed_by: <user._id>` after each successful auth event. Failed attempts (wrong password, etc.) are not logged by this task — only successful authentications.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/authAuditLog.test.js`:

```js
const request = require('supertest');
const app = require('../../src/app');
const AuditLog = require('../../src/models/AuditLog');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Integration Test: Auth Event Audit Logging', () => {
  test('logs a REGISTER audit event on successful registration', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Grace Owner',
      email: 'grace@example.com',
      phone: '+18885555555',
      password: 'GracesPassword1!',
    });

    expect(res.statusCode).toEqual(201);

    const log = await AuditLog.findOne({ action: 'REGISTER', entity_type: 'User' });
    expect(log).not.toBeNull();
    expect(log.cafe_id).toBeNull();
    expect(log.entity_id.toString()).toEqual(res.body.data.user.id.toString());
    expect(log.performed_by.toString()).toEqual(res.body.data.user.id.toString());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/integration/authAuditLog.test.js --runInBand`

Expected: FAIL — no `AuditLog` document exists (`log` is `null`), since `registerUser` doesn't call `logAuditEvent` yet.

- [ ] **Step 3: Relax the AuditLog schema — cafe_id is not always known**

In `backend/src/models/AuditLog.js`, the current field is:

```js
    cafe_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cafe',
      required: true,
      index: true,
    },
```

Change `required: true` to `required: false`:

```js
    cafe_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cafe',
      required: false,
      index: true,
    },
```

This is backward compatible — every existing call site (`tableController.js`) always passes a real `cafeId`, so this only changes behavior for the new `cafe_id: null` case this task introduces.

- [ ] **Step 4: Wire logAuditEvent into registerUser**

In `backend/src/controllers/authController.js`, add this import near the top, alongside the existing `User`/`config`/error imports:

```js
const { logAuditEvent } = require('../services/auditService');
```

In `registerUser`, find:

```js
    await user.save();
    const token = generateToken(user._id);

    res.status(201).json({
```

and insert an audit call between `generateToken` and the response:

```js
    await user.save();
    const token = generateToken(user._id);

    await logAuditEvent({
      cafeId: null,
      entityType: 'User',
      entityId: user._id,
      action: 'REGISTER',
      performedByUserId: user._id,
    });

    res.status(201).json({
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npx jest tests/integration/authAuditLog.test.js --runInBand`

Expected: PASS

- [ ] **Step 6: Add a slice for LOGIN**

Append inside the same `describe` block:

```js
  test('logs a LOGIN audit event on successful login', async () => {
    await request(app).post('/api/v1/auth/register').send({
      name: 'Henry Owner',
      email: 'henry@example.com',
      phone: '+18885556666',
      password: 'HenrysPassword1!',
    });

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'henry@example.com',
      password: 'HenrysPassword1!',
    });

    expect(res.statusCode).toEqual(200);

    const log = await AuditLog.findOne({ action: 'LOGIN', entity_type: 'User' });
    expect(log).not.toBeNull();
    expect(log.cafe_id).toBeNull();
    expect(log.entity_id.toString()).toEqual(res.body.data.user.id.toString());
  });
```

Run: `cd backend && npx jest tests/integration/authAuditLog.test.js --runInBand`

Expected: FAIL (`loginUser` doesn't call `logAuditEvent` yet).

In `authController.js`'s `loginUser`, find:

```js
    const token = generateToken(user._id);

    res.status(200).json({
      status: 'success',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          staff_memberships: user.staff_memberships,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res, next) => {
```

The exact line `const token = generateToken(user._id);` appears three times in this file — once each in `registerUser`, `loginUser`, and `customerQuickAuth`. Use the surrounding context above (the `const getMe = async (req, res, next) => {` line immediately after) to find the right one — it only appears once in the file, right after `loginUser`'s closing brace, which is how you know this is `loginUser`'s occurrence and not the other two. Insert the audit call right after that line:

```js
    const token = generateToken(user._id);

    await logAuditEvent({
      cafeId: null,
      entityType: 'User',
      entityId: user._id,
      action: 'LOGIN',
      performedByUserId: user._id,
    });

    res.status(200).json({
```

Run: `cd backend && npx jest tests/integration/authAuditLog.test.js --runInBand`

Expected: PASS

- [ ] **Step 7: Add a slice for CUSTOMER_QUICK_AUTH**

Append inside the same `describe` block:

```js
  test('logs a CUSTOMER_QUICK_AUTH audit event on successful quick-auth', async () => {
    const res = await request(app).post('/api/v1/auth/customer-quick-auth').send({
      name: 'Ivy Guest',
      email: 'ivy@example.com',
      phone: '+18885557777',
    });

    expect(res.statusCode).toEqual(200);

    const log = await AuditLog.findOne({ action: 'CUSTOMER_QUICK_AUTH', entity_type: 'User' });
    expect(log).not.toBeNull();
    expect(log.cafe_id).toBeNull();
    expect(log.entity_id.toString()).toEqual(res.body.data.user.id.toString());
  });
```

Run: `cd backend && npx jest tests/integration/authAuditLog.test.js --runInBand`

Expected: FAIL (`customerQuickAuth` doesn't call `logAuditEvent` yet).

In `authController.js`'s `customerQuickAuth`, find:

```js
    const token = generateToken(user._id);

    res.status(200).json({
      status: 'success',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          staff_memberships: user.staff_memberships,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
```

This is the third occurrence of `const token = generateToken(user._id);` in the file (`registerUser` and `loginUser` were handled in Steps 4 and 6). Use the `module.exports = {` line immediately after — it only appears once in the file, at the very end, right after `customerQuickAuth`'s closing brace — to confirm this is the right one. Insert the audit call after it:

```js
    const token = generateToken(user._id);

    await logAuditEvent({
      cafeId: null,
      entityType: 'User',
      entityId: user._id,
      action: 'CUSTOMER_QUICK_AUTH',
      performedByUserId: user._id,
    });

    res.status(200).json({
```

Run: `cd backend && npx jest tests/integration/authAuditLog.test.js --runInBand`

Expected: PASS

- [ ] **Step 8: Run the full backend test suite**

Run: `cd backend && npm test`

Expected: All suites pass.

- [ ] **Step 9: Commit**

```bash
git add backend/src/models/AuditLog.js backend/src/controllers/authController.js backend/tests/integration/authAuditLog.test.js
git commit -m "$(cat <<'EOF'
Audit-log register, login, and customer-quick-auth events

AuditLog already existed and was wired into table/reservation mutations,
but auth events — including the ones that would have exploited the
account-takeover bug fixed earlier in this series — left no trace.
cafe_id becomes optional on AuditLog (auth events have no cafe context);
existing cafe-scoped call sites are unaffected since they always pass a
real cafeId.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Require a stronger JWT_SECRET

**Files:**
- Modify: `backend/src/config/env.js`
- Create: `backend/tests/unit/env.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `envSchema` (a Zod schema), newly exported alongside the existing default `config` export from `backend/src/config/env.js`. Existing consumers (`require('../config/env')` then `config.PORT`, `config.JWT_SECRET`, etc.) are unaffected — this only adds `config.envSchema` as an additional property.

This repo's `backend/.env` already has a 34-character `JWT_SECRET`, and `backend/.env.example`'s placeholder is 35 characters — raising the minimum to 32 will not break the existing local setup. Still, confirm before running the full suite: a shorter secret would make every test fail at module-load time (`parseEnv()` throws immediately on import), not just the new test.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/env.test.js`:

```js
const config = require('../../src/config/env');

describe('Environment Config Schema', () => {
  test('rejects a JWT_SECRET shorter than 32 characters', () => {
    const result = config.envSchema.safeParse({
      MONGO_URI: 'mongodb://localhost:27017/test',
      JWT_SECRET: 'short-secret-16c',
    });

    expect(result.success).toBe(false);
  });

  test('accepts a JWT_SECRET of at least 32 characters', () => {
    const result = config.envSchema.safeParse({
      MONGO_URI: 'mongodb://localhost:27017/test',
      JWT_SECRET: 'a'.repeat(32),
    });

    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/unit/env.test.js`

Expected: FAIL — `config.envSchema` is `undefined` (not exported yet), so `config.envSchema.safeParse` throws a `TypeError`.

- [ ] **Step 3: Export envSchema and raise the minimum length**

In `backend/src/config/env.js`, the current content is:

```js
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('5000').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 characters long'),
  RAZORPAY_KEY_ID: z.string().optional().default('rzp_test_key_id'),
  RAZORPAY_KEY_SECRET: z.string().optional().default('rzp_test_key_secret'),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default('rzp_test_webhook_secret'),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.format());
    throw new Error('Invalid environment variables configuration');
  }
  return result.data;
};

const config = parseEnv();

module.exports = config;
```

Replace the `JWT_SECRET` line:

```js
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 characters long'),
```

with:

```js
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long for adequate signing security'),
```

And replace the final `module.exports = config;` line with:

```js
module.exports = { ...config, envSchema };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest tests/unit/env.test.js`

Expected: PASS

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && npm test`

Expected: All suites pass. If anything fails at startup with an "Invalid environment variables configuration" error, `backend/.env`'s `JWT_SECRET` is shorter than 32 characters — stop and report the actual length (not the value) rather than lowering the minimum back down.

- [ ] **Step 6: Commit**

```bash
git add backend/src/config/env.js backend/tests/unit/env.test.js
git commit -m "$(cat <<'EOF'
Raise JWT_SECRET minimum length to 32 characters

8 characters was far too permissive for an HMAC secret signing 7-day
tokens. Also exports envSchema alongside the existing config object so
the validation rule is unit-testable without mutating process.env or
resetting the module cache.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
