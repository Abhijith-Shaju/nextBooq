# Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send a 6-digit verification code by email at registration, and let a logged-in user verify (or request a new code) from a dedicated page — non-blocking, nothing gates on verification status yet.

**Architecture:** A new hashed/time-limited code (mirroring the existing password-reset token pattern) is generated at registration and stored on `User`; `registerUser` fires the send without blocking the response. Two new `authenticate`-gated endpoints let the logged-in user verify their own code or request a fresh one. A single frontend page handles both actions.

**Tech Stack:** Express + Mongoose (backend), Resend via the existing `emailService.js` (email), Next.js App Router + React Query + Vitest (frontend), Jest + Supertest (backend tests).

## Global Constraints

- Spec source: `docs/superpowers/specs/2026-08-16-email-verification-design.md`.
- Email only — no phone/SMS verification in this plan.
- Verification is non-blocking: registration, login, and account usage are entirely unaffected by verification status. Nothing gates on `is_email_verified` in this plan.
- Codes: 6-digit numeric, generated via `crypto.randomInt` (cryptographically secure, not `Math.random`), stored on `User` only as a SHA-256 hash (never the raw code), expire 15 minutes after issuance, single-use (a resend invalidates any prior code).
- `verify-email` and `resend-verification-email` are `authenticate`-gated (act on the current logged-in user's own account) — not anonymous, unlike the password-reset endpoints.
- Both new endpoints go through the existing `authRateLimiter` middleware.
- Registration's email-send call is fire-and-forget (`.catch(...)`, never `await`ed) — email delivery must never block or fail account creation, same pattern as `forgotPassword`.
- Already-verified calls to either endpoint are idempotent `200`s, not errors.
- No banner/nudge UI in this plan — just the mechanism (endpoints + page).
- Follow existing code patterns exactly: controllers return `{ status: 'success', ... }`; errors use the `AppError` subclasses in `backend/src/utils/errors.js`; email service functions follow `sendPasswordResetEmail`'s exact shape (`{ logged, data, error }`, log-fallback when `RESEND_API_KEY` unset, try/catch around the Resend SDK call).

---

## Task 1: Backend — verification code utility and User model fields

**Files:**
- Create: `backend/src/utils/emailVerification.js`
- Modify: `backend/src/models/User.js`
- Test: `backend/tests/unit/emailVerification.test.js`

**Interfaces:**
- Produces: `generateVerificationCode(): { code: string, codeHash: string, expiresAt: Date }` (a 6-digit zero-padded numeric string, e.g. `"004821"`) and `hashVerificationCode(code: string): string` — consumed by Task 2's controller changes and Task 3's new endpoints.
- Produces (model): `User.is_email_verified: boolean` (default `false`), `User.email_verification_code_hash: string | null`, `User.email_verification_expires_at: Date | null`.

- [ ] **Step 1: Write the failing unit test**

Create `backend/tests/unit/emailVerification.test.js`:

```javascript
const { generateVerificationCode, hashVerificationCode, VERIFICATION_CODE_TTL_MS } = require('../../src/utils/emailVerification');

describe('emailVerification code utility', () => {
  test('generateVerificationCode returns a 6-digit numeric code whose hash matches codeHash', () => {
    const { code, codeHash } = generateVerificationCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(hashVerificationCode(code)).toBe(codeHash);
  });

  test('generateVerificationCode sets an expiry roughly 15 minutes in the future', () => {
    const before = Date.now();
    const { expiresAt } = generateVerificationCode();
    const after = Date.now();
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + VERIFICATION_CODE_TTL_MS - 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + VERIFICATION_CODE_TTL_MS + 1000);
  });

  test('generated codes are not all identical across many calls', () => {
    // With a 6-digit code space, a 20-sample collision-to-1-unique-value is
    // astronomically unlikely (not a real flake risk) — this just guards
    // against a broken generator that returns a constant.
    const codes = new Set();
    for (let i = 0; i < 20; i++) {
      codes.add(generateVerificationCode().code);
    }
    expect(codes.size).toBeGreaterThan(1);
  });

  test('hashVerificationCode is deterministic', () => {
    expect(hashVerificationCode('123456')).toBe(hashVerificationCode('123456'));
  });

  test('hashVerificationCode differs for different inputs', () => {
    expect(hashVerificationCode('123456')).not.toBe(hashVerificationCode('654321'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/unit/emailVerification.test.js`
Expected: FAIL — `Cannot find module '../../src/utils/emailVerification'`

- [ ] **Step 3: Write the implementation**

Create `backend/src/utils/emailVerification.js`:

```javascript
const crypto = require('crypto');

const VERIFICATION_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const hashVerificationCode = (code) => crypto.createHash('sha256').update(code).digest('hex');

const generateVerificationCode = () => {
  // crypto.randomInt is cryptographically secure (unlike Math.random),
  // matching the same security posture as passwordReset.js's token generation.
  const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  const codeHash = hashVerificationCode(code);
  const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
  return { code, codeHash, expiresAt };
};

module.exports = { generateVerificationCode, hashVerificationCode, VERIFICATION_CODE_TTL_MS };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest tests/unit/emailVerification.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Add the fields to the User model**

Edit `backend/src/models/User.js` — add these three fields to `userSchema`, right after the existing `password_reset_expires_at` field (before the closing `},` of the schema definition object):

```javascript
    // 6-digit code, hashed (SHA-256) and time-limited, sent via email at
    // registration (see backend/src/utils/emailVerification.js). Cleared on
    // successful verification, or overwritten by a newer code request (only
    // the most recently issued code is ever valid). Non-blocking: nothing
    // in the app currently gates on is_email_verified.
    is_email_verified: {
      type: Boolean,
      default: false,
    },
    email_verification_code_hash: {
      type: String,
      default: null,
    },
    email_verification_expires_at: {
      type: Date,
      default: null,
    },
```

- [ ] **Step 6: Run the full backend suite to confirm no regressions**

Run: `cd backend && npx jest`
Expected: only the known, pre-existing 12 failures in `tests/integration/reservationLogicRuthless.test.js` (hardcoded past dates, unrelated to this change) — no new failures.

- [ ] **Step 7: Commit**

```bash
git add backend/src/utils/emailVerification.js backend/tests/unit/emailVerification.test.js backend/src/models/User.js
git commit -m "feat: add hashed verification code fields to User and a code utility"
```

---

## Task 2: Backend — send verification email at registration

**Files:**
- Modify: `backend/src/services/emailService.js`
- Modify: `backend/src/utils/authUserResponse.js`
- Modify: `backend/src/controllers/authController.js:52-111` (`registerUser`)
- Modify: `backend/tests/integration/authAccountSemantics.test.js:19-27` (`expectedAuthUserKeys`)
- Create: `backend/tests/integration/emailVerification.test.js`

**Interfaces:**
- Consumes: `generateVerificationCode` (Task 1, `backend/src/utils/emailVerification.js`).
- Produces: `sendVerificationEmail({ to, code }): Promise<{ logged: boolean, data: object|null, error: object|null }>` — same shape as `sendPasswordResetEmail`. `buildAuthUserPayload(user, opts)` now also includes `is_email_verified: boolean` in its returned object — consumed by Task 3's endpoints (which read `req.user.is_email_verified` directly off the Mongoose document, not this payload) and Task 4's frontend types.

- [ ] **Step 1: Write the failing integration test**

Create `backend/tests/integration/emailVerification.test.js`:

```javascript
const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');

jest.mock('../../src/services/emailService', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
  sendVerificationEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
}));
const { sendVerificationEmail } = require('../../src/services/emailService');

setupTestDB();

describe('Email verification', () => {
  beforeEach(() => {
    sendVerificationEmail.mockClear();
  });

  test('registration stores a hashed verification code and calls the email service', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Verify Me',
      email: 'verify-flow@example.com',
      phone: '+15550400001',
      password: 'RegisterPassword1!',
    });

    expect(res.status).toBe(201);
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(sendVerificationEmail.mock.calls[0][0].to).toBe('verify-flow@example.com');

    const user = await User.findOne({ email: 'verify-flow@example.com' });
    expect(user.is_email_verified).toBe(false);
    expect(user.email_verification_code_hash).toBeTruthy();
    expect(user.email_verification_expires_at).toBeTruthy();
    expect(user.email_verification_expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  test('registration succeeds even when the email service rejects', async () => {
    sendVerificationEmail.mockRejectedValueOnce(new Error('provider down'));

    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Verify Fails',
      email: 'verify-fails@example.com',
      phone: '+15550400002',
      password: 'RegisterPassword1!',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('verify-fails@example.com');
  });

  test('registration response includes is_email_verified: false', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Verify Payload',
      email: 'verify-payload@example.com',
      phone: '+15550400003',
      password: 'RegisterPassword1!',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.user.is_email_verified).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/integration/emailVerification.test.js`
Expected: FAIL — `sendVerificationEmail` doesn't exist yet, and `is_email_verified` isn't in the response.

- [ ] **Step 3: Add `sendVerificationEmail` to the email service**

Edit `backend/src/services/emailService.js` — add this function after the existing `sendPasswordResetEmail` function (both share the top-of-file `const { Resend } = require('resend');` and `const config = require('../config/env');`):

```javascript
const sendVerificationEmail = async ({ to, code }) => {
  if (!config.RESEND_API_KEY) {
    console.log(
      `[emailService] RESEND_API_KEY not set — logging verification code instead of sending. to=${to} code=${code}`
    );
    return { logged: true, data: null, error: null };
  }

  const resend = new Resend(config.RESEND_API_KEY);

  try {
    const { data, error } = await resend.emails.send({
      from: config.FROM_EMAIL,
      to,
      subject: 'Verify your nextBooq email address',
      html: `
        <p>Welcome to nextBooq! Use the code below to verify your email address.</p>
        <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${code}</p>
        <p>This code expires in 15 minutes. If you didn't create a nextBooq account, you can safely ignore this email.</p>
      `,
    });

    if (error) {
      console.error('[emailService] Failed to send verification email:', error);
    }

    return { logged: false, data, error };
  } catch (err) {
    console.error('[emailService] Failed to send verification email:', err);
    return { logged: false, data: null, error: { message: err.message } };
  }
};
```

Update the file's `module.exports` to also export it:

```javascript
module.exports = { sendPasswordResetEmail, sendVerificationEmail };
```

- [ ] **Step 4: Add `is_email_verified` to the auth payload**

Edit `backend/src/utils/authUserResponse.js` — change `buildAuthUserPayload`:

```javascript
const buildAuthUserPayload = (user, { ownerOrgId = null } = {}) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  is_platform_admin: Boolean(user.is_platform_admin),
  owner_org_id: ownerOrgId,
  is_email_verified: Boolean(user.is_email_verified),
  staff_memberships: Array.isArray(user.staff_memberships)
    ? user.staff_memberships.filter((membership) => membership?.cafe_id)
    : [],
});
```

- [ ] **Step 5: Wire verification-code generation into registration**

Edit `backend/src/controllers/authController.js`:

Add these imports near the top (after the existing `sendPasswordResetEmail` import):

```javascript
const { generateVerificationCode } = require('../utils/emailVerification');
```

Change the line that imports from `emailService` to also pull in `sendVerificationEmail`:

```javascript
const { sendPasswordResetEmail, sendVerificationEmail } = require('../services/emailService');
```

In `registerUser`, replace this block:

```javascript
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const user = new User({
      name: name.trim(),
      email: email.toLowerCase(),
      phone: phone.trim(),
      password_hash,
      staff_memberships: [],
    });

    await user.save();
    const token = generateToken(user._id);
    setAuthCookie(res, token);

    await logAuditEvent({
```

with:

```javascript
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const { code, codeHash, expiresAt } = generateVerificationCode();

    const user = new User({
      name: name.trim(),
      email: email.toLowerCase(),
      phone: phone.trim(),
      password_hash,
      staff_memberships: [],
      email_verification_code_hash: codeHash,
      email_verification_expires_at: expiresAt,
    });

    await user.save();
    const token = generateToken(user._id);
    setAuthCookie(res, token);

    // Fire-and-forget, same rationale as forgotPassword: verification email
    // delivery must never block or fail account creation.
    sendVerificationEmail({ to: user.email, code }).catch((err) => {
      console.error('[registerUser] Failed to send verification email:', err);
    });

    await logAuditEvent({
```

- [ ] **Step 6: Update the pre-existing key-list assertion**

Edit `backend/tests/integration/authAccountSemantics.test.js` — update `expectedAuthUserKeys` (lines 19-27) to include the new field:

```javascript
const expectedAuthUserKeys = [
  'email',
  'id',
  'is_email_verified',
  'is_platform_admin',
  'name',
  'owner_org_id',
  'phone',
  'staff_memberships',
].sort();
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd backend && npx jest tests/integration/emailVerification.test.js tests/integration/authAccountSemantics.test.js`
Expected: PASS (3 new tests, and all pre-existing `authAccountSemantics.test.js` tests still pass with the updated key list)

- [ ] **Step 8: Run the full backend suite**

Run: `cd backend && npx jest`
Expected: only the known, pre-existing 12 failures in `reservationLogicRuthless.test.js` — no new failures.

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/emailService.js backend/src/utils/authUserResponse.js backend/src/controllers/authController.js backend/tests/integration/authAccountSemantics.test.js backend/tests/integration/emailVerification.test.js
git commit -m "feat: send a verification code email at registration"
```

---

## Task 3: Backend — verify-email and resend-verification-email endpoints

**Files:**
- Modify: `backend/src/controllers/authController.js`
- Modify: `backend/src/routes/v1/authRoutes.js`
- Modify: `backend/tests/integration/emailVerification.test.js`

**Interfaces:**
- Consumes: `hashVerificationCode`, `generateVerificationCode` (Task 1); `sendVerificationEmail` (Task 2); `req.user` (the raw, unpopulated `User` document set by the `authenticate` middleware — has `_id`, `is_email_verified`, `email` directly available).
- Produces: `POST /api/v1/auth/verify-email` (authenticated, body `{ code }`) → `{ status: 'success', message: string }` (200 on success or already-verified, 400 on invalid/expired code). `POST /api/v1/auth/resend-verification-email` (authenticated, no body) → `{ status: 'success', message: string }`.

- [ ] **Step 1: Write the failing integration tests**

Add to `backend/tests/integration/emailVerification.test.js`, inside the existing `describe('Email verification', ...)` block (after the registration tests):

```javascript
  describe('verify-email and resend-verification-email', () => {
    const register = (overrides = {}) =>
      request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Verify Endpoint',
          email: 'verify-endpoint@example.com',
          phone: '+15550400010',
          password: 'RegisterPassword1!',
          ...overrides,
        });

    test('rejects an unauthenticated verify-email request with 401', async () => {
      const res = await request(app).post('/api/v1/auth/verify-email').send({ code: '123456' });
      expect(res.status).toBe(401);
    });

    test('rejects an unauthenticated resend-verification-email request with 401', async () => {
      const res = await request(app).post('/api/v1/auth/resend-verification-email');
      expect(res.status).toBe(401);
    });

    test('verifies with the correct code and flips is_email_verified', async () => {
      const registerRes = await register({ email: 'verify-correct@example.com', phone: '+15550400011' });
      const token = registerRes.body.data.token;
      const user = await User.findOne({ email: 'verify-correct@example.com' });
      const { hashVerificationCode } = require('../../src/utils/emailVerification');
      await User.findByIdAndUpdate(user._id, {
        email_verification_code_hash: hashVerificationCode('123456'),
        email_verification_expires_at: new Date(Date.now() + 15 * 60 * 1000),
      });

      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '123456' });

      expect(res.status).toBe(200);
      const updated = await User.findById(user._id);
      expect(updated.is_email_verified).toBe(true);
      expect(updated.email_verification_code_hash).toBeNull();
      expect(updated.email_verification_expires_at).toBeNull();
    });

    test('rejects an incorrect code with 400', async () => {
      const registerRes = await register({ email: 'verify-wrong@example.com', phone: '+15550400012' });
      const token = registerRes.body.data.token;

      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '000000' });

      expect(res.status).toBe(400);
    });

    test('rejects an expired code with 400', async () => {
      const registerRes = await register({ email: 'verify-expired@example.com', phone: '+15550400013' });
      const token = registerRes.body.data.token;
      const user = await User.findOne({ email: 'verify-expired@example.com' });
      const { hashVerificationCode } = require('../../src/utils/emailVerification');
      await User.findByIdAndUpdate(user._id, {
        email_verification_code_hash: hashVerificationCode('654321'),
        email_verification_expires_at: new Date(Date.now() - 60 * 1000),
      });

      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '654321' });

      expect(res.status).toBe(400);
    });

    test('verify-email on an already-verified account is idempotent (200, no code required to match)', async () => {
      const registerRes = await register({ email: 'verify-already@example.com', phone: '+15550400014' });
      const token = registerRes.body.data.token;
      const user = await User.findOne({ email: 'verify-already@example.com' });
      await User.findByIdAndUpdate(user._id, { is_email_verified: true });

      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'irrelevant' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/already verified/i);
    });

    test('resend-verification-email issues a new code that invalidates the old one', async () => {
      const registerRes = await register({ email: 'verify-resend@example.com', phone: '+15550400015' });
      const token = registerRes.body.data.token;
      const user = await User.findOne({ email: 'verify-resend@example.com' });
      const { hashVerificationCode } = require('../../src/utils/emailVerification');
      await User.findByIdAndUpdate(user._id, {
        email_verification_code_hash: hashVerificationCode('111111'),
        email_verification_expires_at: new Date(Date.now() + 15 * 60 * 1000),
      });

      sendVerificationEmail.mockClear();
      const resendRes = await request(app)
        .post('/api/v1/auth/resend-verification-email')
        .set('Authorization', `Bearer ${token}`);

      expect(resendRes.status).toBe(200);
      expect(sendVerificationEmail).toHaveBeenCalledTimes(1);

      const oldCodeAttempt = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '111111' });
      expect(oldCodeAttempt.status).toBe(400);
    });

    test('resend-verification-email on an already-verified account is idempotent and does not send', async () => {
      const registerRes = await register({ email: 'verify-resend-already@example.com', phone: '+15550400016' });
      const token = registerRes.body.data.token;
      const user = await User.findOne({ email: 'verify-resend-already@example.com' });
      await User.findByIdAndUpdate(user._id, { is_email_verified: true });

      sendVerificationEmail.mockClear();
      const res = await request(app)
        .post('/api/v1/auth/resend-verification-email')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/already verified/i);
      expect(sendVerificationEmail).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest tests/integration/emailVerification.test.js`
Expected: FAIL — 404s on the new routes (not defined yet)

- [ ] **Step 3: Implement the controller functions**

Edit `backend/src/controllers/authController.js` — add this import near the top, alongside the existing `passwordReset` import:

```javascript
const { hashVerificationCode } = require('../utils/emailVerification');
```

(`generateVerificationCode` is already imported from Task 2.)

Add these two functions after `resetPassword` (before `customerQuickAuth`):

```javascript
const verifyEmail = async (req, res, next) => {
  try {
    if (req.user.is_email_verified) {
      return res.status(200).json({
        status: 'success',
        message: 'Your email is already verified.',
      });
    }

    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      throw new BadRequestError('Verification code is required');
    }

    const codeHash = hashVerificationCode(code);
    const user = await User.findOne({
      _id: req.user._id,
      email_verification_code_hash: codeHash,
      email_verification_expires_at: { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestError('Invalid or expired code.');
    }

    user.is_email_verified = true;
    user.email_verification_code_hash = null;
    user.email_verification_expires_at = null;
    await user.save();

    await logAuditEvent({
      cafeId: null,
      entityType: 'User',
      entityId: user._id,
      action: 'EMAIL_VERIFIED',
      performedByUserId: user._id,
    });

    res.status(200).json({
      status: 'success',
      message: 'Email verified.',
    });
  } catch (error) {
    next(error);
  }
};

const resendVerificationEmail = async (req, res, next) => {
  try {
    if (req.user.is_email_verified) {
      return res.status(200).json({
        status: 'success',
        message: 'Your email is already verified.',
      });
    }

    const { code, codeHash, expiresAt } = generateVerificationCode();

    const user = await User.findById(req.user._id);
    user.email_verification_code_hash = codeHash;
    user.email_verification_expires_at = expiresAt;
    await user.save();

    sendVerificationEmail({ to: user.email, code }).catch((err) => {
      console.error('[resendVerificationEmail] Failed to send verification email:', err);
    });

    await logAuditEvent({
      cafeId: null,
      entityType: 'User',
      entityId: user._id,
      action: 'EMAIL_VERIFICATION_RESENT',
      performedByUserId: user._id,
    });

    res.status(200).json({
      status: 'success',
      message: 'Verification code sent.',
    });
  } catch (error) {
    next(error);
  }
};
```

Update `module.exports` to include both:

```javascript
module.exports = {
  registerUser,
  loginUser,
  getMe,
  logoutUser,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerificationEmail,
  customerQuickAuth,
  getSocketToken,
};
```

- [ ] **Step 4: Wire the new routes**

Edit `backend/src/routes/v1/authRoutes.js`:

```javascript
const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  getMe,
  logoutUser,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerificationEmail,
  customerQuickAuth,
  getSocketToken,
} = require('../../controllers/authController');
const { authenticate } = require('../../middleware/auth');
const { authRateLimiter } = require('../../middleware/rateLimiter');

router.post('/register', authRateLimiter, registerUser);
router.post('/login', authRateLimiter, loginUser);
router.post('/forgot-password', authRateLimiter, forgotPassword);
router.post('/reset-password', authRateLimiter, resetPassword);
router.post('/verify-email', authenticate, authRateLimiter, verifyEmail);
router.post('/resend-verification-email', authenticate, authRateLimiter, resendVerificationEmail);
router.post('/customer-quick-auth', authRateLimiter, customerQuickAuth);
router.get('/me', authenticate, getMe);
router.post('/logout', logoutUser);
router.get('/socket-token', authenticate, getSocketToken);

module.exports = router;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx jest tests/integration/emailVerification.test.js`
Expected: PASS (all tests)

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && npx jest`
Expected: only the known, pre-existing 12 failures in `reservationLogicRuthless.test.js` — no new failures.

- [ ] **Step 7: Commit**

```bash
git add backend/src/controllers/authController.js backend/src/routes/v1/authRoutes.js backend/tests/integration/emailVerification.test.js
git commit -m "feat: add verify-email and resend-verification-email endpoints"
```

---

## Task 4: Frontend — verify-email page

**Files:**
- Modify: `frontend/src/lib/types/models.d.ts:166-176` (`User` interface)
- Create: `frontend/src/hooks/auth/use-verify-email.ts`
- Create: `frontend/src/hooks/auth/use-resend-verification-email.ts`
- Create: `frontend/src/app/(control-plane)/auth/verify-email/page.tsx`
- Create: `frontend/src/app/(control-plane)/auth/verify-email/page.test.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/auth/verify-email`, `POST /api/v1/auth/resend-verification-email` (Task 3); `useAuth()` (`frontend/src/components/providers/auth-provider`) exposing `{ user, isAuthenticated, isLoading }`, where `user.is_email_verified` is now populated (Task 2's backend change).
- Produces: `User.is_email_verified: boolean` added to the shared `models.d.ts` type. `useVerifyEmail()` — `mutate({ code: string }, { onSuccess, onError })`. `useResendVerificationEmail()` — `mutate()` (no payload).

- [ ] **Step 1: Add the type field**

Edit `frontend/src/lib/types/models.d.ts` — in the `User` interface:

```typescript
export interface User {
  id: string;
  _id?: string;
  email: string;
  name: string;
  phone?: string;
  staff_memberships: StaffMembership[];
  created_at?: string;
  is_platform_admin: boolean;
  owner_org_id: string | null;
  is_email_verified: boolean;
}
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/app/(control-plane)/auth/verify-email/page.test.tsx`:

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import VerifyEmailPage from './page';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

const useAuthMock = vi.fn();
vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => useAuthMock(),
}));

const verifyMutateMock = vi.fn();
vi.mock('@/hooks/auth/use-verify-email', () => ({
  useVerifyEmail: () => ({ mutate: verifyMutateMock, isPending: false }),
}));

const resendMutateMock = vi.fn();
vi.mock('@/hooks/auth/use-resend-verification-email', () => ({
  useResendVerificationEmail: () => ({ mutate: resendMutateMock, isPending: false }),
}));

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    verifyMutateMock.mockReset();
    resendMutateMock.mockReset();
  });

  test('redirects to login when there is no authenticated user', async () => {
    useAuthMock.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false });

    render(<VerifyEmailPage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/auth/login?callbackUrl=%2Fauth%2Fverify-email'));
  });

  test('renders nothing while auth is still loading', () => {
    useAuthMock.mockReturnValue({ user: null, isAuthenticated: false, isLoading: true });

    const { queryByText } = render(<VerifyEmailPage />);

    expect(queryByText('Verify your email')).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  test('shows an already-verified state without a form when the user is already verified', () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', email: 'user@example.com', is_email_verified: true },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<VerifyEmailPage />);

    expect(screen.getByText(/your email is already verified/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /verify email/i })).not.toBeInTheDocument();
  });

  test('submits the entered code to the mutation', () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', email: 'user@example.com', is_email_verified: false },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<VerifyEmailPage />);

    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify email/i }));

    expect(verifyMutateMock).toHaveBeenCalledWith(
      { code: '123456' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  test('shows a distinct success message after a successful verification', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', email: 'user@example.com', is_email_verified: false },
      isAuthenticated: true,
      isLoading: false,
    });
    verifyMutateMock.mockImplementation((_payload, { onSuccess }) => onSuccess());

    render(<VerifyEmailPage />);

    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify email/i }));

    await waitFor(() => expect(screen.getByText('Email verified.')).toBeInTheDocument());
  });

  test('shows an inline error and keeps the form when verification fails', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', email: 'user@example.com', is_email_verified: false },
      isAuthenticated: true,
      isLoading: false,
    });
    verifyMutateMock.mockImplementation((_payload, { onError }) => onError());

    render(<VerifyEmailPage />);

    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: /verify email/i }));

    await waitFor(() => expect(screen.getByText(/invalid or expired code/i)).toBeInTheDocument());
    expect(screen.getByPlaceholderText('6-digit code')).toBeInTheDocument();
  });

  test('resend button triggers the resend mutation', () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', email: 'user@example.com', is_email_verified: false },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<VerifyEmailPage />);

    fireEvent.click(screen.getByRole('button', { name: /resend/i }));

    expect(resendMutateMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx vitest run "src/app/(control-plane)/auth/verify-email/page.test.tsx"`
Expected: FAIL — `Cannot find module './page'` (and the two hook modules don't exist yet either)

- [ ] **Step 4: Add the hooks**

Create `frontend/src/hooks/auth/use-verify-email.ts`:

```typescript
import { useMutation } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';

export interface VerifyEmailPayload {
  code: string;
}

interface VerifyEmailResponse {
  message: string;
}

export const useVerifyEmail = () => {
  return useMutation({
    mutationFn: async (payload: VerifyEmailPayload) => {
      const { data } = await axiosInstance.post<VerifyEmailResponse>('/api/v1/auth/verify-email', payload);
      return data;
    },
  });
};
```

Create `frontend/src/hooks/auth/use-resend-verification-email.ts`:

```typescript
import { useMutation } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';

interface ResendVerificationEmailResponse {
  message: string;
}

export const useResendVerificationEmail = () => {
  return useMutation({
    mutationFn: async () => {
      const { data } = await axiosInstance.post<ResendVerificationEmailResponse>(
        '/api/v1/auth/resend-verification-email'
      );
      return data;
    },
  });
};
```

- [ ] **Step 5: Add the page**

Create `frontend/src/app/(control-plane)/auth/verify-email/page.tsx`:

```typescript
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Coffee, ArrowRight, Loader2, Mail } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { useVerifyEmail } from '@/hooks/auth/use-verify-email';
import { useResendVerificationEmail } from '@/hooks/auth/use-resend-verification-email';

function VerifyEmailContent() {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [succeeded, setSucceeded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const verifyEmailMutation = useVerifyEmail();
  const resendMutation = useResendVerificationEmail();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    verifyEmailMutation.mutate(
      { code },
      {
        onSuccess: () => setSucceeded(true),
        onError: () => setErrorMessage('Invalid or expired code.'),
      }
    );
  };

  const handleResend = () => {
    resendMutation.mutate();
  };

  if (user?.is_email_verified || succeeded) {
    return (
      <div className="space-y-4 text-center">
        <p className="font-sans text-brand-brown text-sm bg-brand-tan/40 rounded-xl p-4">
          {succeeded ? 'Email verified.' : 'Your email is already verified.'}
        </p>
        <Link href="/" className="text-brand-red font-semibold hover:underline text-sm">
          Continue to nextBooq
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      <div>
        <label className="block text-sm font-semibold text-brand-brown mb-1.5">
          Verification Code
        </label>
        <div className="relative">
          <Mail className="w-5 h-5 text-brand-mocha absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            inputMode="numeric"
            required
            maxLength={6}
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-brand-brown/20 bg-white/80 focus:bg-white focus:ring-2 focus:ring-brand-red focus:outline-none transition-all text-sm"
          />
        </div>
      </div>

      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

      <button
        type="submit"
        disabled={verifyEmailMutation.isPending}
        className="w-full cta-hero py-3.5 justify-center mt-2 text-base font-semibold shadow-brand-md"
      >
        {verifyEmailMutation.isPending ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Verifying...
          </>
        ) : (
          <>
            Verify Email <ArrowRight className="w-4 h-4 ml-1" />
          </>
        )}
      </button>

      <button
        type="button"
        onClick={handleResend}
        disabled={resendMutation.isPending}
        className="w-full text-center text-sm text-brand-mocha hover:text-brand-brown underline disabled:opacity-50"
      >
        {resendMutation.isPending ? 'Sending...' : "Didn't get a code? Resend"}
      </button>
    </form>
  );
}

export default function VerifyEmailPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/auth/login?callbackUrl=%2Fauth%2Fverify-email');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full space-y-8">
        <div className="flex items-center justify-center gap-2">
          <div className="w-10 h-10 bg-brand-red rounded-xl flex items-center justify-center shadow-brand-md">
            <Coffee className="w-5 h-5 text-white" />
          </div>
          <span className="font-display font-bold text-2xl text-brand-brown">
            next<span className="text-brand-red">Booq</span>
          </span>
        </div>

        <div className="glass rounded-3xl p-8 space-y-6 shadow-brand-md border border-brand-brown/10">
          <div className="text-center">
            <h1 className="font-display text-3xl font-bold text-brand-brown">Verify your email</h1>
            <p className="font-sans text-brand-mocha text-sm mt-1">
              Enter the 6-digit code we sent to {user?.email}.
            </p>
          </div>

          <VerifyEmailContent />
        </div>

        <div className="text-center">
          <Link href="/" className="inline-block text-brand-mocha hover:text-brand-brown text-sm transition-colors">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd frontend && npx vitest run "src/app/(control-plane)/auth/verify-email/page.test.tsx"`
Expected: PASS (7 tests)

- [ ] **Step 7: Run the full frontend test suite and type-check**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS, no new type errors.

- [ ] **Step 8: Manual verification in the browser**

Start the dev servers (backend + frontend), with `RESEND_API_KEY` left unset (so codes log to the backend console instead of sending real email). Register a new test account, check the backend console for the logged 6-digit code, log in with that account, navigate to `/auth/verify-email`, enter the code, and confirm the success state. Then log out, log back in, revisit `/auth/verify-email`, and confirm it now shows the "already verified" state without a form. Also test the "Resend" button and confirm a new code appears in the console while the old one is rejected.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/types/models.d.ts frontend/src/hooks/auth/use-verify-email.ts frontend/src/hooks/auth/use-resend-verification-email.ts "frontend/src/app/(control-plane)/auth/verify-email/page.tsx" "frontend/src/app/(control-plane)/auth/verify-email/page.test.tsx"
git commit -m "feat: add verify-email page"
```
