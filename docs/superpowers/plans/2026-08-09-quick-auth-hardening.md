# Quick-Auth Hardening & Failure Audit Trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Follow-up from the auth-security-fixes grilling session — make `customer-quick-auth` always require a password (closing the guest-lockout bug class at its root rather than patching around it), give the app a failure-side audit trail (failed logins, failed quick-auth attempts, rate-limit blocks) to match the success-side one already shipped, and document the one undocumented operational landmine (`JWT_SECRET` rotation logs everyone out).

**Architecture:** No new architecture. Three independent, bounded changes to code that already exists (`authController.js`, `AuditLog.js`, `rateLimiter.js`, `auth-overlay.tsx`). Trust-proxy configuration and password-reset/account-recovery are explicitly out of scope — deferred by the user during grilling, not part of this plan.

**Tech Stack:** Backend: Node/Express 5, Mongoose 9, bcryptjs, Jest 30, Supertest 7, `express-rate-limit` 8.6.2. Frontend: Next.js 15, TypeScript, React.

## Global Constraints

- Package manager is npm. Backend and frontend are separate `package.json`s (`backend/`, `frontend/`).
- Never commit with `--no-verify`. Never use `git commit --amend` unless told to.
- Run the *full* existing test suite for the package you touched after every task.
- Backend tests use an in-memory MongoDB replica set (`mongodb-memory-server`, `backend/tests/setup.js`).
- There are zero `AuditLog` read queries anywhere in `backend/src` (verified during the prior plan's final review) — relaxing a required field on this schema carries no query-side risk, only a write-side one, and only for the new call sites this plan adds.
- `express-rate-limit`'s in-memory store counts by IP across every route sharing one middleware instance. Jest gives each test **file** a fresh module registry (and therefore a fresh limiter instance) — confirmed empirically in the prior plan's final review. Within one file, all auth-endpoint calls across all tests share the same 20-request budget. Keep any test file that intentionally exhausts the limit to a single test, and keep cumulative auth-endpoint calls in any other file comfortably under 20.
- `req.ip` reflects the raw socket peer, not a real client IP, because `trust proxy` is intentionally left unconfigured (deferred — no deployment target has been chosen yet). Audit logs written by this plan will carry accurate IPs once that's configured later; this plan does not attempt it.
- Commit message style: one-line summary, blank line, short paragraph explaining *why*, ending with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

## File Structure

- Modify: `backend/src/controllers/authController.js` — Task 1 (require password unconditionally in `customerQuickAuth`), Task 2 (add `LOGIN_FAILED` / `CUSTOMER_QUICK_AUTH_FAILED` audit calls)
- Modify: `backend/tests/integration/customerAuth.test.js` — Task 1 (fix tests broken by the new requirement, replace the now-wrong "brand-new account, no password" test)
- Modify: `frontend/src/components/booking/auth-overlay.tsx` — Task 1 (password required, copy fix)
- Modify: `frontend/src/hooks/auth/use-customer-quick-auth.ts` — Task 1 (payload type: `password` no longer optional)
- Modify: `backend/src/models/AuditLog.js` — Task 2 (`entity_id` becomes optional)
- Modify: `backend/src/middleware/rateLimiter.js` — Task 2 (custom `handler` to audit-log blocks)
- Create: `backend/tests/integration/authFailureAuditLog.test.js` — Task 2
- Create: `backend/tests/integration/rateLimitAuditLog.test.js` — Task 2
- Modify: `backend/.env.example` — Task 3

---

### Task 1: Quick-auth always requires a password

**Files:**
- Modify: `backend/src/controllers/authController.js:153-190` (the `customerQuickAuth` function)
- Modify: `backend/tests/integration/customerAuth.test.js`
- Modify: `frontend/src/components/booking/auth-overlay.tsx:35-88, 204-219`
- Modify: `frontend/src/hooks/auth/use-customer-quick-auth.ts:7-11`

**Interfaces:**
- Consumes: nothing new.
- Produces: `POST /api/v1/auth/customer-quick-auth` now returns `400` whenever `password` is missing, for *both* new and existing accounts (previously only existing-account matches without a password were rejected, and only with `401`). A brand-new account can no longer be created without a password the caller chose themselves — the `GuestPass_<timestamp>` auto-generation is gone.

The current code, for reference (you're replacing the middle of this):

```js
const customerQuickAuth = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!email || !phone || !name) {
      throw new BadRequestError('Name, email, and phone number are required');
    }

    const cleanEmail = email.toLowerCase().trim();
    let user = await User.findOne({ email: cleanEmail });

    if (!user) {
      user = await User.findOne({ phone: phone.trim() });
    }

    if (!user) {
      const userPassword = password || `GuestPass_${Date.now()}`;
      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash(userPassword, salt);

      user = new User({
        name: name.trim(),
        email: cleanEmail,
        phone: phone.trim(),
        password_hash,
        staff_memberships: [],
      });
      await user.save();
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

    const token = generateToken(user._id);
    ...
```

- [ ] **Step 1: Write the failing test — brand-new account without a password is now rejected**

Open `backend/tests/integration/customerAuth.test.js`. Find this existing test (near the bottom, just before the `describe` block's closing `});`):

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

Replace it with the opposite assertion — this is the behavior we're intentionally flipping:

```js
  test('customer-quick-auth rejects a brand-new account when no password is provided', async () => {
    const res = await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({
        name: 'Frank NewGuest',
        email: 'frank@example.com',
        phone: '+18885554444',
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.data).toBeUndefined();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/integration/customerAuth.test.js -t "rejects a brand-new account" --runInBand`

Expected: FAIL — the current code creates the account and returns `200`, not `400`.

- [ ] **Step 3: Remove the passwordless path**

In `backend/src/controllers/authController.js`, replace the whole `customerQuickAuth` function body from the `try {` line through the `const token = generateToken(user._id);` line with:

```js
const customerQuickAuth = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!email || !phone || !name || !password) {
      throw new BadRequestError('Name, email, phone, and password are required');
    }

    const cleanEmail = email.toLowerCase().trim();
    let user = await User.findOne({ email: cleanEmail });

    if (!user) {
      user = await User.findOne({ phone: phone.trim() });
    }

    if (!user) {
      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash(password, salt);

      user = new User({
        name: name.trim(),
        email: cleanEmail,
        phone: phone.trim(),
        password_hash,
        staff_memberships: [],
      });
      await user.save();
    } else {
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        throw new UnauthorizedError('Invalid password for existing customer account');
      }
    }

    const token = generateToken(user._id);
```

Everything from `const token = generateToken(user._id);` onward (the `logAuditEvent` call, the `res.status(200).json(...)`, the `catch` block) stays exactly as it is — you're only replacing the code above that line.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest tests/integration/customerAuth.test.js -t "rejects a brand-new account" --runInBand`

Expected: PASS

- [ ] **Step 5: Add a regression test — brand-new account WITH a password still works**

Append this test immediately after the one from Step 1, inside the same `describe` block:

```js
  test('customer-quick-auth creates a brand-new account when a password is provided', async () => {
    const res = await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({
        name: 'Frank NewGuest',
        email: 'frank2@example.com',
        phone: '+18885554445',
        password: 'FranksPassword1!',
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toEqual('frank2@example.com');
  });
```

Run: `cd backend && npx jest tests/integration/customerAuth.test.js -t "creates a brand-new account when a password" --runInBand`

Expected: PASS immediately — this confirms Step 3's implementation didn't break account creation entirely, it's a regression guard rather than a test that drives new code. Note this transparently rather than claiming a red step that didn't happen.

- [ ] **Step 6: Fix the test that now gets a different status code for the same security property**

Find this existing test:

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

The security property this test proves — you can't take over Carol's account by omitting the password — still holds after Step 3, but now the rejection happens earlier (at the top-level "all fields required" check, before the code even looks up whether `carol@example.com` belongs to an existing account), so the status code changes from `401` to `400`. Change only the expected status:

```js
    expect(res.statusCode).toEqual(400);
    expect(res.body.data).toBeUndefined();
```

Run: `cd backend && npx jest tests/integration/customerAuth.test.js -t "rejects an existing account when no password" --runInBand`

Expected: PASS

- [ ] **Step 7: Fix the test that omitted a password for a legitimate reservation flow**

Find this existing test:

```js
  test('Customer holds reservation and populates CafeCustomer rolodex record', async () => {
    // 1. Quick auth customer
    const authRes = await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({
        name: 'Bob Guest',
        email: 'bob@example.com',
        phone: '+18885559999',
      });
```

Add a password to the payload:

```js
  test('Customer holds reservation and populates CafeCustomer rolodex record', async () => {
    // 1. Quick auth customer
    const authRes = await request(app)
      .post('/api/v1/auth/customer-quick-auth')
      .send({
        name: 'Bob Guest',
        email: 'bob@example.com',
        phone: '+18885559999',
        password: 'BobsPassword1!',
      });
```

Nothing else in this test changes — the rest of the flow (holding a reservation, checking the `CafeCustomer` rolodex record, fetching history) is unaffected.

Run: `cd backend && npx jest tests/integration/customerAuth.test.js --runInBand`

Expected: PASS — all 8 tests in this file.

- [ ] **Step 8: Run the full backend test suite**

Run: `cd backend && npm test`

Expected: All suites pass.

- [ ] **Step 9: Update the frontend — require a password in AuthOverlay**

In `frontend/src/components/booking/auth-overlay.tsx`, find the validation block inside `handleHoldReservation` (around line 41-54):

```tsx
    if (!isAuthenticated) {
      if (!guestName.trim()) {
        toast.error('Please enter your full name');
        return;
      }
      if (!isValidEmail(guestEmail)) {
        toast.error('Please enter a valid email address');
        return;
      }
      if (!isValidPhone(guestPhone)) {
        toast.error('Please enter a valid contact phone number');
        return;
      }
    }
```

Add a password check after the phone check:

```tsx
    if (!isAuthenticated) {
      if (!guestName.trim()) {
        toast.error('Please enter your full name');
        return;
      }
      if (!isValidEmail(guestEmail)) {
        toast.error('Please enter a valid email address');
        return;
      }
      if (!isValidPhone(guestPhone)) {
        toast.error('Please enter a valid contact phone number');
        return;
      }
      if (guestPassword.trim().length < 8) {
        toast.error('Please enter a password of at least 8 characters');
        return;
      }
    }
```

- [ ] **Step 10: Stop sending an undefined password**

In the same file, find (around line 62-69):

```tsx
      if (!isAuthenticated) {
        // Authenticate / Register Customer user account seamlessly
        await quickAuth.mutateAsync({
          name: guestName.trim(),
          email: guestEmail.trim(),
          phone: guestPhone.trim(),
          password: guestPassword.trim() || undefined,
        });
      }
```

Change the last field — password is always present now, so the `|| undefined` fallback (which existed to omit the field for the old passwordless path) is no longer needed:

```tsx
      if (!isAuthenticated) {
        // Authenticate / Register Customer user account seamlessly
        await quickAuth.mutateAsync({
          name: guestName.trim(),
          email: guestEmail.trim(),
          phone: guestPhone.trim(),
          password: guestPassword.trim(),
        });
      }
```

- [ ] **Step 11: Fix the misleading label and placeholder**

In the same file, find (around line 204-219):

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

Replace with (no longer conditional — this field is now always required, same as the three above it):

```tsx
              <div>
                <Label className="text-xs font-semibold text-brand-brown flex items-center justify-between">
                  <span>Password <span className="text-brand-red">*</span></span>
                  <span className="text-[10px] text-brand-mocha">At least 8 characters</span>
                </Label>
                <div className="relative mt-1">
                  <Lock className="w-4 h-4 text-brand-mocha absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <Input
                    type="password"
                    placeholder="Choose a password for your account"
                    value={guestPassword}
                    onChange={(e) => setGuestPassword(e.target.value)}
                    className="pl-10 h-11 text-sm rounded-xl border-brand-brown/20 focus:border-brand-red focus:ring-brand-red/20"
                  />
                </div>
              </div>
```

- [ ] **Step 12: Update the payload type**

In `frontend/src/hooks/auth/use-customer-quick-auth.ts`, find:

```ts
export interface CustomerQuickAuthPayload {
  name: string;
  email: string;
  phone: string;
  password?: string;
}
```

Remove the `?` — password is no longer optional:

```ts
export interface CustomerQuickAuthPayload {
  name: string;
  email: string;
  phone: string;
  password: string;
}
```

- [ ] **Step 13: Run the frontend test suite and typecheck**

Run: `cd frontend && npm test`
Run: `cd frontend && npx tsc --noEmit`

Expected: All existing tests still pass (this task adds no new frontend tests — `AuthOverlay` has no component-level test harness set up in this repo, same as when its copy was last touched in the previous plan; this is a note for whoever reviews this task, not a gap to silently paper over). Typecheck must report zero errors, since `CustomerQuickAuthPayload.password` losing its `?` will surface any other caller still passing `undefined` — there should be none, but this is exactly what the typecheck step is for.

- [ ] **Step 14: Commit**

```bash
git add backend/src/controllers/authController.js backend/tests/integration/customerAuth.test.js frontend/src/components/booking/auth-overlay.tsx frontend/src/hooks/auth/use-customer-quick-auth.ts
git commit -m "$(cat <<'EOF'
Require a password for customer-quick-auth, always

customer-quick-auth let a brand-new account be created with no password
at all, auto-generating an unknowable GuestPass_<timestamp> hash instead.
That account then had no way back in through any UI path once the prior
account-takeover fix correctly started requiring a password for existing
accounts — the convenience feature was quietly minting permanently
locked-out accounts.

Password is now required unconditionally, for new and existing accounts
alike. The lookup-by-email-or-phone logic that decides whether a request
is "returning customer" or "brand new" is unchanged; only the "we'll
generate one for you" fallback is gone. AuthOverlay's copy no longer lies
about the field being conditional.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Audit-log failed auth attempts and rate-limit blocks

**Files:**
- Modify: `backend/src/models/AuditLog.js:15-18` (`entity_id` becomes optional)
- Modify: `backend/src/controllers/authController.js` (`loginUser`, `customerQuickAuth` failure branches)
- Modify: `backend/src/middleware/rateLimiter.js`
- Create: `backend/tests/integration/authFailureAuditLog.test.js`
- Create: `backend/tests/integration/rateLimitAuditLog.test.js`

**Interfaces:**
- Consumes: `logAuditEvent({ cafeId, entityType, entityId, action, beforeState, afterState, performedByUserId })` from `backend/src/services/auditService.js` — unchanged signature, already used for the success-side events (`REGISTER`, `LOGIN`, `CUSTOMER_QUICK_AUTH`).
- Produces: three new audit `action` values — `LOGIN_FAILED`, `CUSTOMER_QUICK_AUTH_FAILED`, `RATE_LIMIT_BLOCKED`. `LOGIN_FAILED` and `CUSTOMER_QUICK_AUTH_FAILED` carry `entity_id: <user._id>` when the account exists but the password was wrong, or `entity_id: null` when no account matched at all (email enumeration attempts). `RATE_LIMIT_BLOCKED` always carries `entity_id: null` (no account is known — the block happens before any auth logic runs) with `entity_type: 'RateLimit'`. All three store `{ ip: req.ip }` in `after_state` (plus `attempted_email` for the unknown-email case, plus `path` for rate-limit blocks) — there's no dedicated IP column on this schema, and `after_state` is already a free-form `Mixed` field used exactly this way.

- [ ] **Step 1: Write the failing test — LOGIN_FAILED on wrong password**

Create `backend/tests/integration/authFailureAuditLog.test.js`:

```js
const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const AuditLog = require('../../src/models/AuditLog');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Integration Test: Failed Auth Attempt Audit Logging', () => {
  test('logs a LOGIN_FAILED audit event when the password is wrong', async () => {
    await request(app).post('/api/v1/auth/register').send({
      name: 'Jack Owner',
      email: 'jack@example.com',
      phone: '+18885558888',
      password: 'JacksRealPassword1!',
    });

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'jack@example.com',
      password: 'TotallyWrongPassword!',
    });

    expect(res.statusCode).toEqual(401);

    const user = await User.findOne({ email: 'jack@example.com' });
    const log = await AuditLog.findOne({ action: 'LOGIN_FAILED', entity_id: user._id });
    expect(log).not.toBeNull();
    expect(log.entity_type).toEqual('User');
    expect(log.after_state.ip).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/integration/authFailureAuditLog.test.js --runInBand`

Expected: FAIL — no `LOGIN_FAILED` audit event exists yet, so `log` is `null`.

- [ ] **Step 3: Log the wrong-password branch of loginUser**

In `backend/src/controllers/authController.js`, find (inside `loginUser`):

```js
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const token = generateToken(user._id);

    await logAuditEvent({
      cafeId: null,
      entityType: 'User',
      entityId: user._id,
      action: 'LOGIN',
      performedByUserId: user._id,
    });
```

Add a `logAuditEvent` call before the `throw` in the wrong-password branch:

```js
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await logAuditEvent({
        cafeId: null,
        entityType: 'User',
        entityId: user._id,
        action: 'LOGIN_FAILED',
        afterState: { ip: req.ip },
        performedByUserId: null,
      });
      throw new UnauthorizedError('Invalid credentials');
    }

    const token = generateToken(user._id);

    await logAuditEvent({
      cafeId: null,
      entityType: 'User',
      entityId: user._id,
      action: 'LOGIN',
      performedByUserId: user._id,
    });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest tests/integration/authFailureAuditLog.test.js --runInBand`

Expected: PASS

- [ ] **Step 5: Add a slice for an unknown email (no account exists at all)**

Append inside the same `describe` block:

```js
  test('logs a LOGIN_FAILED audit event with a null entity when the email matches no account', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'nobody-registered@example.com',
      password: 'WhateverPassword1!',
    });

    expect(res.statusCode).toEqual(401);

    const log = await AuditLog.findOne({
      action: 'LOGIN_FAILED',
      'after_state.attempted_email': 'nobody-registered@example.com',
    });
    expect(log).not.toBeNull();
    expect(log.entity_id).toBeNull();
  });
```

Run: `cd backend && npx jest tests/integration/authFailureAuditLog.test.js --runInBand`

Expected: FAIL — the "user not found" branch doesn't log anything yet, and even if it tried to with `entity_id: null`, `AuditLog.entity_id` is currently `required: true`, so the save would fail validation (silently swallowed by `logAuditEvent`'s try/catch, so the test fails on "no matching document" either way).

- [ ] **Step 6: Relax entity_id and log the user-not-found branch**

In `backend/src/models/AuditLog.js`, find:

```js
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
```

Change to:

```js
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
    },
```

This is backward compatible — every other call site (`tableController.js`, and this file's own successful-auth events) always passes a real `entityId`; this only permits the new no-account case.

In `backend/src/controllers/authController.js`, find (inside `loginUser`):

```js
    const user = await User.findOne({ email: email.toLowerCase() }).populate({
      path: 'staff_memberships.cafe_id',
      select: 'name slug timezone org_id',
    });
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }
```

Add a `logAuditEvent` call before the `throw`:

```js
    const user = await User.findOne({ email: email.toLowerCase() }).populate({
      path: 'staff_memberships.cafe_id',
      select: 'name slug timezone org_id',
    });
    if (!user) {
      await logAuditEvent({
        cafeId: null,
        entityType: 'User',
        entityId: null,
        action: 'LOGIN_FAILED',
        afterState: { attempted_email: email.toLowerCase(), ip: req.ip },
        performedByUserId: null,
      });
      throw new UnauthorizedError('Invalid credentials');
    }
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd backend && npx jest tests/integration/authFailureAuditLog.test.js --runInBand`

Expected: PASS — both tests in this file.

- [ ] **Step 8: Add a slice for CUSTOMER_QUICK_AUTH_FAILED**

Append inside the same `describe` block:

```js
  test('logs a CUSTOMER_QUICK_AUTH_FAILED audit event when the password is wrong', async () => {
    await request(app).post('/api/v1/auth/customer-quick-auth').send({
      name: 'Kelly Guest',
      email: 'kelly@example.com',
      phone: '+18885559090',
      password: 'KellysRealPassword1!',
    });

    const res = await request(app).post('/api/v1/auth/customer-quick-auth').send({
      name: 'Kelly Guest',
      email: 'kelly@example.com',
      phone: '+18885559090',
      password: 'WrongPassword1!',
    });

    expect(res.statusCode).toEqual(401);

    const user = await User.findOne({ email: 'kelly@example.com' });
    const log = await AuditLog.findOne({ action: 'CUSTOMER_QUICK_AUTH_FAILED', entity_id: user._id });
    expect(log).not.toBeNull();
    expect(log.after_state.ip).toBeDefined();
  });
```

Run: `cd backend && npx jest tests/integration/authFailureAuditLog.test.js --runInBand`

Expected: FAIL — `customerQuickAuth`'s wrong-password branch doesn't log yet.

- [ ] **Step 9: Log the wrong-password branch of customerQuickAuth**

In `backend/src/controllers/authController.js`, find (inside `customerQuickAuth`, the code you wrote in Task 1 Step 3):

```js
    } else {
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        throw new UnauthorizedError('Invalid password for existing customer account');
      }
    }
```

Add a `logAuditEvent` call before the `throw`:

```js
    } else {
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        await logAuditEvent({
          cafeId: null,
          entityType: 'User',
          entityId: user._id,
          action: 'CUSTOMER_QUICK_AUTH_FAILED',
          afterState: { ip: req.ip },
          performedByUserId: null,
        });
        throw new UnauthorizedError('Invalid password for existing customer account');
      }
    }
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `cd backend && npx jest tests/integration/authFailureAuditLog.test.js --runInBand`

Expected: PASS — all 3 tests in this file.

- [ ] **Step 11: Write the failing test for RATE_LIMIT_BLOCKED**

Create `backend/tests/integration/rateLimitAuditLog.test.js`:

```js
const request = require('supertest');
const app = require('../../src/app');
const AuditLog = require('../../src/models/AuditLog');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Integration Test: Rate Limit Block Audit Logging', () => {
  test('logs a RATE_LIMIT_BLOCKED audit event when a client exceeds the auth rate limit', async () => {
    const credentials = { email: 'nobody@example.com', password: 'wrong-password' };

    for (let i = 0; i < 20; i++) {
      await request(app).post('/api/v1/auth/login').send(credentials);
    }

    const blockedRes = await request(app).post('/api/v1/auth/login').send(credentials);
    expect(blockedRes.status).toBe(429);

    const log = await AuditLog.findOne({ action: 'RATE_LIMIT_BLOCKED' });
    expect(log).not.toBeNull();
    expect(log.entity_id).toBeNull();
    expect(log.after_state.path).toEqual('/api/v1/auth/login');
    expect(log.after_state.ip).toBeDefined();
  }, 20000);
});
```

This file intentionally contains only this one test, for the same reason `authRateLimit.test.js` does — the shared per-file rate-limit counter would make a second test in this file interfere with the first.

- [ ] **Step 12: Run the test to verify it fails**

Run: `cd backend && npx jest tests/integration/rateLimitAuditLog.test.js --runInBand`

Expected: FAIL — no `RATE_LIMIT_BLOCKED` audit event exists yet.

- [ ] **Step 13: Add a custom handler to the rate limiter**

In `backend/src/middleware/rateLimiter.js`, the current content is:

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

Replace it with:

```js
const rateLimit = require('express-rate-limit');
const { logAuditEvent } = require('../services/auditService');

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logAuditEvent({
      cafeId: null,
      entityType: 'RateLimit',
      entityId: null,
      action: 'RATE_LIMIT_BLOCKED',
      afterState: { path: req.originalUrl, ip: req.ip },
      performedByUserId: null,
    });
    res.status(options.statusCode).json(options.message);
  },
  message: {
    status: 'fail',
    statusCode: 429,
    message: 'Too many authentication attempts. Please try again later.',
  },
});

module.exports = { authRateLimiter };
```

`handler` is `express-rate-limit` 8.6.2's documented hook for customizing what happens when a client is blocked (`node_modules/express-rate-limit/dist/index.d.ts`, `RateLimitExceededEventHandler`) — by default it just sends `statusCode`/`message` from options; this replicates that exact response (`res.status(options.statusCode).json(options.message)`) while adding the audit call first. The `message` option stays configured (unchanged) since `options.message` inside the handler is that same value — this is not a behavior change for the existing `authRateLimit.test.js` test, only an addition.

Note: `logAuditEvent` is called without `await` here — `handler` is a synchronous-style callback (not awaited by `express-rate-limit`), and `logAuditEvent` already swallows its own errors internally, so this matches the fire-and-forget pattern already established for audit logging elsewhere in this codebase.

- [ ] **Step 14: Run the test to verify it passes**

Run: `cd backend && npx jest tests/integration/rateLimitAuditLog.test.js --runInBand`

Expected: PASS

- [ ] **Step 15: Run the full backend test suite**

Run: `cd backend && npm test`

Expected: All suites pass, including the unchanged `authRateLimit.test.js` (its assertions on `blockedRes.body.message` still hold, since the handler sends the identical response body).

- [ ] **Step 16: Commit**

```bash
git add backend/src/models/AuditLog.js backend/src/controllers/authController.js backend/src/middleware/rateLimiter.js backend/tests/integration/authFailureAuditLog.test.js backend/tests/integration/rateLimitAuditLog.test.js
git commit -m "$(cat <<'EOF'
Audit-log failed auth attempts and rate-limit blocks

AuditLog only ever recorded successful register/login/quick-auth events —
every attack this series has been fixing (the account-takeover attempts,
the brute-force login had no rate limit) left zero trace. Adds
LOGIN_FAILED, CUSTOMER_QUICK_AUTH_FAILED, and RATE_LIMIT_BLOCKED events,
each carrying the client IP (accurate once trust proxy is eventually
configured, raw socket peer until then) in after_state, since AuditLog has
no dedicated IP column.

entity_id becomes optional on AuditLog for the cases with no known
account — an unrecognized email, or a rate-limit block that happens before
any auth logic runs at all. Existing entity-bearing call sites are
unaffected.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Document the JWT_SECRET rotation consequence

**Files:**
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing code-facing — this is a documentation-only change, no test.

- [ ] **Step 1: Add the warning comment**

The current content of `backend/.env.example` is:

```
# Environment Variables Configuration
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/nextbooq
JWT_SECRET=super_secret_jwt_key_nextbooq_2026
RAZORPAY_KEY_ID=rzp_test_key_id
RAZORPAY_KEY_SECRET=rzp_test_key_secret
RAZORPAY_WEBHOOK_SECRET=rzp_test_webhook_secret
```

Replace the `JWT_SECRET` line with a comment above it plus the existing line unchanged:

```
# Environment Variables Configuration
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/nextbooq
# Must be at least 32 characters. Rotating this value logs out every
# signed-in user immediately — there is no token revocation store, so an
# already-issued JWT simply fails signature verification on its next
# request rather than being individually invalidated. Plan rotations
# accordingly; there is currently no graceful way to stage one.
JWT_SECRET=super_secret_jwt_key_nextbooq_2026
RAZORPAY_KEY_ID=rzp_test_key_id
RAZORPAY_KEY_SECRET=rzp_test_key_secret
RAZORPAY_WEBHOOK_SECRET=rzp_test_webhook_secret
```

- [ ] **Step 2: Commit**

```bash
git add backend/.env.example
git commit -m "$(cat <<'EOF'
Document the JWT_SECRET rotation consequence

Nothing in this repo said that rotating JWT_SECRET silently logs out
every user, or that there's no revocation store to stage that rotation
gracefully. The final review of the auth-security-fixes series flagged
this as undocumented operational risk; this is the fix for that finding.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
