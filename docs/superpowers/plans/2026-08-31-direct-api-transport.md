# Direct API Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Point browser API calls at `api.nextbooq.in` directly instead of proxying them through the Vercel rewrite, so IP-keyed rate limiting buckets per end user rather than per proxy.

**Architecture:** The session cookie moves from host-only on the Vercel origin to `.nextbooq.in`, set from a new `COOKIE_DOMAIN` env var, and is renamed `accessToken` → `nb_session` for a clean cut. The Next.js middleware keeps reading it because `www.` and `api.` share a registrable domain. The `/api/:path*` rewrite is deleted and axios targets `NEXT_PUBLIC_API_URL`.

**Tech Stack:** Backend — Node/Express 5, Mongoose, `cookie-parser`, Jest + supertest. Frontend — Next.js App Router, TypeScript, axios, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-31-direct-api-transport-design.md`

## Global Constraints

- The cookie name is exactly **`nb_session`**. The backend must **reject** `accessToken` — this is a deliberate clean cut, not a dual-accept transition.
- `setAuthCookie` and `clearAuthCookie` must carry **identical** attributes (`httpOnly`, `secure`, `sameSite`, `domain`, `path`). A mismatch makes `clearCookie` a silent no-op and logout stops working.
- `COOKIE_DOMAIN` is a **new optional** env var. Unset means host-only (correct for `localhost`). It must NOT gain a production assertion in `env.js`'s `superRefine` block — unset is a valid production configuration.
- The domain must come from config, never hardcoded in source.
- `sameSite: 'lax'` and `secure: config.NODE_ENV === 'production'` are unchanged. This change is transport and cookie scope only — no change to authentication logic, session lifetime, or JWT contents.
- The `Authorization: Bearer` code path in `middleware/auth.js` is untouched and must keep working.
- The existing verify-email isolation tests (`frontend/src/app/(control-plane)/auth/verify-email/page.test.tsx`) and the cafe-onboarding suite must pass **untouched**. They are the regression net for this auth path.
- Backend tests: `cd backend && npx jest <path> --runInBand`. Frontend tests: `cd frontend && npx vitest run <path>`. Frontend must also pass `cd frontend && npm run typecheck`.
- **Do not run `npm run lint`** — this repo has no ESLint config. Do not create one.
- Known pre-existing failures, not to be fixed here: backend `e2e` full reservation lifecycle, `availableSlotsBatchedQueries`, `availableSlotsOperatingHours` (hardcoded near-term dates that age out); frontend `payments-editor.test.tsx` (5 tests, "No QueryClient set").

---

### Task 1: Backend — cookie rename, domain, and env var

**Files:**
- Modify: `backend/src/config/env.js`
- Modify: `backend/src/controllers/authController.js`
- Modify: `backend/src/middleware/auth.js`
- Test: `backend/tests/integration/cookieAuth.test.js` (extend and update)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the backend sets and reads a cookie named `nb_session`, scoped to `config.COOKIE_DOMAIN` when that is set. Task 2's frontend `SESSION_COOKIE_NAME` must match this name exactly.

- [ ] **Step 1: Write the failing tests**

Open `backend/tests/integration/cookieAuth.test.js`. Change the existing `extractCookie` helper to look for the new name, and the logout assertion to match it:

```js
  const extractCookie = (res) => {
    const setCookieHeaders = res.headers['set-cookie'] || [];
    return setCookieHeaders.find((c) => c.startsWith('nb_session='));
  };
```

and in the `logout clears the session cookie` test:

```js
    expect(cookie).toMatch(/nb_session=;/);
```

Then append this new describe block to the same file:

```js
describe('session cookie attributes and scope', () => {
  const creds = {
    name: 'Scope User',
    email: 'scope-user@test.com',
    phone: '+1112229999',
    password: 'password123',
  };

  const login = async () => {
    await request(app).post('/api/v1/auth/register').send(creds);
    return request(app).post('/api/v1/auth/login').send({ email: creds.email, password: creds.password });
  };

  const sessionCookie = (res) =>
    (res.headers['set-cookie'] || []).find((c) => c.startsWith('nb_session='));

  test('the session cookie is named nb_session, not accessToken', async () => {
    const res = await login();
    const all = res.headers['set-cookie'] || [];

    expect(all.some((c) => c.startsWith('nb_session='))).toBe(true);
    expect(all.some((c) => c.startsWith('accessToken='))).toBe(false);
  });

  test('the session cookie carries httpOnly, SameSite=Lax and Path=/', async () => {
    const cookie = sessionCookie(await login());

    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
  });

  test('an accessToken cookie is no longer accepted for authentication', async () => {
    const loginRes = await login();
    const raw = sessionCookie(loginRes).split(';')[0].split('=')[1];

    const res = await request(app).get('/api/v1/auth/me').set('Cookie', `accessToken=${raw}`);

    expect(res.status).toBe(401);
  });

  test('the same token still authenticates as an Authorization bearer header', async () => {
    const loginRes = await login();
    const raw = sessionCookie(loginRes).split(';')[0].split('=')[1];

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${raw}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(creds.email);
  });

  test('with COOKIE_DOMAIN unset the cookie is host-only (no Domain attribute)', async () => {
    // The test environment leaves COOKIE_DOMAIN unset — this is the guard
    // that local development keeps working, where a .nextbooq.in cookie
    // would never be stored by a browser on localhost.
    const cookie = sessionCookie(await login());

    expect(cookie).not.toMatch(/Domain=/i);
  });

  test('logout clears the cookie with the same attributes it was set with', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    const cookie = sessionCookie(res);

    // A clearCookie whose attributes differ from the original is a silent
    // no-op in the browser, so logout would appear to succeed and not work.
    expect(cookie).toMatch(/nb_session=;/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/integration/cookieAuth.test.js --runInBand`
Expected: FAIL — the cookie is still named `accessToken`, so `extractCookie` returns `undefined` and the new assertions fail.

- [ ] **Step 3: Add `COOKIE_DOMAIN` to `backend/src/config/env.js`**

Add to the zod schema, immediately after `CORS_ALLOWED_ORIGINS`:

```js
    // Scope for the session cookie. Set to ".nextbooq.in" in production so
    // the cookie is sent to both the app (www) and the API (api) — the
    // Next.js middleware reads it on the app's origin to protect routes,
    // while the API needs it to authenticate. Left unset in development,
    // where a domain-scoped cookie would never be stored by a browser on
    // localhost. Deliberately has no production assertion below: unset is a
    // valid production configuration (host-only cookie).
    COOKIE_DOMAIN: z.string().optional(),
```

Do **not** add anything to the `superRefine` production guard block.

- [ ] **Step 4: Rename and scope the cookie in `backend/src/controllers/authController.js`**

Replace `setAuthCookie` and `clearAuthCookie`:

```js
// Both helpers must stay attribute-identical. A clearCookie whose domain,
// path, sameSite or secure flags differ from the cookie that was set does
// not match it, so the browser keeps the original and logout silently
// fails.
const SESSION_COOKIE_NAME = 'nb_session';

const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'lax',
  domain: config.COOKIE_DOMAIN || undefined,
  path: '/',
});

const setAuthCookie = (res, token) => {
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...sessionCookieOptions(),
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
  });
};

const clearAuthCookie = (res) => {
  res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
};
```

- [ ] **Step 5: Read the new cookie name in `backend/src/middleware/auth.js`**

Replace the cookie branch:

```js
    } else if (req.cookies?.nb_session) {
      // Browser clients no longer send an Authorization header — the session
      // lives in an httpOnly cookie set on login (see authController.js).
      // Scoped to COOKIE_DOMAIN so both the app and API origins receive it.
      token = req.cookies.nb_session;
    }
```

- [ ] **Step 6: Find any other test that hardcodes the old name**

Run: `cd backend && grep -rn "accessToken" tests/ src/`

Every remaining hit must be either (a) a test asserting the old name is now rejected, or (b) nothing. Update any other suite that builds a `Cookie: accessToken=...` header to use `nb_session=`. Do not weaken an assertion to make a test pass — only change the cookie name.

- [ ] **Step 7: Run the tests**

Run: `cd backend && npx jest tests/integration/cookieAuth.test.js tests/integration/authAccountSemantics.test.js tests/integration/accountType.test.js --runInBand`
Expected: PASS.

Then the full suite: `cd backend && npx jest --runInBand`
Expected: PASS except the three known date-dependent failures listed in Global Constraints.

- [ ] **Step 8: Commit**

```bash
git add backend/src/config/env.js backend/src/controllers/authController.js backend/src/middleware/auth.js backend/tests/
git commit -m "feat: rename session cookie to nb_session and scope it to COOKIE_DOMAIN"
```

---

### Task 2: Frontend — read the renamed cookie

**Files:**
- Modify: `frontend/src/lib/session.ts`
- Test: `frontend/src/lib/session.test.ts` (extend and update)

**Interfaces:**
- Consumes: the cookie name `nb_session` set by Task 1.
- Produces: `hasSessionCookie` and `hasValidSessionCookie` recognise `nb_session`. `frontend/src/middleware.ts` and `lib/route-guard.ts` consume these unchanged.

- [ ] **Step 1: Write the failing tests**

In `frontend/src/lib/session.test.ts`, update the two existing `hasSessionCookie` tests to the new name and add coverage that the old name is ignored:

```ts
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
```

Read the rest of the file first — it already has `hasValidSessionCookie` tests using the old name. Update those to `nb_session` rather than leaving duplicates.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/session.test.ts`
Expected: FAIL — `SESSION_COOKIE_NAME` is still `accessToken`, so the `nb_session` header is not matched.

- [ ] **Step 3: Change the cookie name**

In `frontend/src/lib/session.ts`:

```ts
const SESSION_COOKIE_NAME = 'nb_session';
```

Update the module's leading comment where it names the cookie, so it stays accurate.

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/lib/session.test.ts src/lib/route-guard.test.ts`
Expected: PASS. `route-guard` must pass unchanged — it depends on `hasValidSessionCookie`'s behaviour, not on the cookie's name.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/session.ts frontend/src/lib/session.test.ts
git commit -m "feat: read the renamed nb_session cookie in the session helpers"
```

---

### Task 3: Frontend — call the API directly and remove the rewrite

**Files:**
- Modify: `frontend/src/hooks/api/axios-instance.ts`
- Modify: `frontend/next.config.ts`
- Modify: `frontend/src/app/[tenant]/(dashboard)/layout.tsx` (comment only)
- Test: `frontend/src/hooks/api/axios-instance.test.ts` (create, or extend if present)

**Interfaces:**
- Consumes: the `.nextbooq.in`-scoped cookie from Task 1, which is what makes a cross-origin request carry the session.
- Produces: browser API calls go to `NEXT_PUBLIC_API_URL`. Nothing later depends on this.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hooks/api/axios-instance.test.ts`:

```ts
import { describe, expect, test, vi, afterEach } from 'vitest';

// axiosInstance is created once at module load from process.env, so each
// case has to reset the module registry and re-import to see a new value.
const loadInstance = async () => {
  vi.resetModules();
  const mod = await import('./axios-instance');
  return mod.axiosInstance;
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('axiosInstance', () => {
  test('targets NEXT_PUBLIC_API_URL when it is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.nextbooq.in');

    const instance = await loadInstance();

    expect(instance.defaults.baseURL).toBe('https://api.nextbooq.in');
  });

  test('falls back to a relative baseURL when NEXT_PUBLIC_API_URL is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');

    const instance = await loadInstance();

    expect(instance.defaults.baseURL).toBe('');
  });

  test('sends credentials so the session cookie rides along cross-origin', async () => {
    // Without this the browser would omit the nb_session cookie on every
    // request to api.nextbooq.in and the whole app would be unauthenticated.
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.nextbooq.in');

    const instance = await loadInstance();

    expect(instance.defaults.withCredentials).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/hooks/api/axios-instance.test.ts`
Expected: FAIL — `baseURL` is currently the hardcoded empty string, so the first case gets `''` instead of the API origin.

- [ ] **Step 3: Point axios at the API origin**

In `frontend/src/hooks/api/axios-instance.ts`, replace the block comment above `axios.create` and the `baseURL`:

```ts
// Requests go straight to the backend's own origin (api.nextbooq.in), not
// through this app. That origin shares a registrable domain with the app, so
// the session cookie — scoped to .nextbooq.in by the backend's COOKIE_DOMAIN
// — is still same-site: the browser attaches it via withCredentials, and
// SameSite=Lax still blocks genuinely cross-site senders. Going direct is
// what lets the backend see the real client IP for rate limiting, instead of
// Vercel's. See src/lib/session.ts.
export const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? '',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});
```

- [ ] **Step 4: Delete the rewrite**

In `frontend/next.config.ts`, remove the entire `async rewrites()` block and the comment above it explaining the proxy. The config becomes:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "localhost",
      },
    ],
  },
  reactStrictMode: true,
};

export default nextConfig;
```

Note the now-unused `backendUrl` const at the top of that file goes with it.

- [ ] **Step 5: Correct the stale socket comment**

In `frontend/src/app/[tenant]/(dashboard)/layout.tsx`, the comment above the socket `connect` function says the REST API is "proxied through this app", which is no longer true. Replace that sentence so it reads:

```tsx
    // Socket.IO connects to the backend's own origin. The httpOnly session
    // cookie isn't sent with a WebSocket handshake, so fetch a short-lived
    // token over the cookie-authenticated REST API instead and hand it to
    // the handshake only — it's never persisted to storage.
```

Leave the code itself alone. Retiring the socket-token handshake is explicitly out of scope.

- [ ] **Step 6: Run the tests**

Run: `cd frontend && npx vitest run src/hooks/api src/lib && npm run typecheck`
Expected: PASS.

Then the full frontend suite: `cd frontend && npx vitest run`
Expected: PASS except the five known `payments-editor.test.tsx` failures. The verify-email and cafe-onboarding suites must be green.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/hooks/api frontend/next.config.ts frontend/src/app
git commit -m "feat: call the API directly instead of proxying through the Vercel rewrite"
```

---

## Deployment (not a code task — for the operator)

Perform after all three tasks are merged.

1. On EC2, add to `backend/.env`:
   ```
   COOKIE_DOMAIN=.nextbooq.in
   CORS_ALLOWED_ORIGINS=https://www.nextbooq.in,https://nextbooq.in
   ```
2. Restart the backend and confirm it booted: `curl.exe -s https://api.nextbooq.in/health`
3. Deploy the frontend (Vercel picks up the merge). `NEXT_PUBLIC_API_URL` is already `https://api.nextbooq.in` and needs no change.
4. Everyone signed in is logged out — expected, the cookie's name and scope both changed.

**Acceptance check.** Compare rate-limit buckets across the two paths:

```bash
curl.exe -s -D - -o NUL "https://api.nextbooq.in/api/v1/cafes/000000000000000000000000/available-slots?date=2026-09-15&partySize=2"
```

Run it, then load the app in a browser and make any API call, then run it again. Before this change the two paths held separate buckets; afterwards `RateLimit-Remaining` must decrement across both, proving one bucket keyed on the real client IP.

Also confirm a browser login survives a page reload and grants access to a protected route — that proves the cookie reaches `api.nextbooq.in` and that the middleware on the Vercel origin can still see it.

**Rollback:** Vercel instant-rollback to the previous deployment, `git revert` the backend commits, restart Node.

---

## Self-Review

**Spec coverage.** Every spec change maps to a task: `COOKIE_DOMAIN` env var, cookie rename, cookie domain, and the `auth.js` read → Task 1; `session.ts` → Task 2; axios `baseURL`, the rewrite deletion, and the stale comments → Task 3. The deployment configuration (`COOKIE_DOMAIN`, `CORS_ALLOWED_ORIGINS` on EC2) is not code and is captured in the Deployment section, as is the spec's acceptance criterion.

**Deliberate gaps.** The spec's Non-goals — rate-limit key hardening and retiring the socket-token handshake — have no task, correctly. The spec's note that the repo has no ESLint config is recorded in Global Constraints as "do not run lint", not as work.

**Type consistency.** The cookie name `nb_session` is defined once in Task 1 (`SESSION_COOKIE_NAME` in `authController.js`, read in `auth.js`) and matched exactly in Task 2 (`SESSION_COOKIE_NAME` in `session.ts`) and in every test assertion across all three tasks. `COOKIE_DOMAIN` is the env var name in Task 1's `env.js`, in `sessionCookieOptions()`, and in the Deployment section. `NEXT_PUBLIC_API_URL` is the existing variable, unchanged.

**Ordering constraint.** Task 1 renames the cookie the frontend reads, so Tasks 1 and 2 must both land before this branch is deployed — Task 1 alone would leave the middleware looking for a cookie that no longer exists, and every protected route would redirect to login. Task 3 is independently safe but pointless without Task 1's domain scoping, since a host-only cookie would not be sent cross-origin. Ship all three together.
