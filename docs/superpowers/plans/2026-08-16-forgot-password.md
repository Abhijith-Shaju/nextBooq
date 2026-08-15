# Forgot Password Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user who forgot their password request an emailed reset link and set a new password, using Resend for delivery.

**Architecture:** A new `emailService.js` wraps the Resend SDK (falling back to console-logging the link when no API key is configured, so dev/test never needs a real key). `User` gains two optional fields for a hashed, single-use, time-limited reset token. Two new auth endpoints (`forgot-password`, `reset-password`) and two new frontend pages complete the flow, both styled to match the existing login/register pages.

**Tech Stack:** Express + Mongoose (backend), Resend (email), Next.js App Router + React Query + Vitest (frontend), Jest + Supertest (backend tests).

## Global Constraints

- Spec source: `docs/superpowers/specs/2026-08-16-forgot-password-design.md`.
- No email/SMS infrastructure exists yet in this repo — this plan builds the `resend`-based email service from scratch, scoped only to what the reset flow needs (no general notification system).
- Reset tokens: generated as random 32-byte hex, stored on `User` only as a SHA-256 hash (never the raw token), expire 30 minutes after issuance, and are single-use (cleared on successful reset or superseded by a newer request).
- The `forgot-password` endpoint MUST return an identical response whether or not the email is registered (no account enumeration), and MUST NOT call the email service for a non-existent email.
- The `reset-password` endpoint MUST return a generic "invalid or expired" error for every failure case (wrong token, expired, already used) — never a distinguishing message.
- Both new endpoints go through the existing `authRateLimiter` middleware, same as `/login` and `/register`.
- New password strength validation reuses the existing `assertPasswordStrength` (min 8 characters) from `authController.js` — do not duplicate this logic.
- A successful reset does NOT auto-login the user.
- Follow existing code patterns exactly: controllers return `{ status: 'success', ... }`; errors use the `AppError` subclasses in `backend/src/utils/errors.js`; frontend pages match the existing `login/page.tsx`/`register/page.tsx` styling (glass card, `lucide-react` icons, `cta-hero` button class).

---

## Task 1: Backend — email service

**Files:**
- Create: `backend/src/services/emailService.js`
- Modify: `backend/src/config/env.js`
- Modify: `backend/.env.example`
- Test: `backend/tests/unit/emailService.test.js`

**Interfaces:**
- Produces: `sendPasswordResetEmail({ to, resetUrl }): Promise<{ logged: boolean, data: object|null, error: object|null }>` — `logged: true` when `RESEND_API_KEY` is unset (link was only console-logged, nothing sent); `logged: false` otherwise, with the Resend SDK's `data`/`error` passed through.
- Produces (env): `config.RESEND_API_KEY: string | undefined`, `config.FROM_EMAIL: string` (defaulted), `config.FRONTEND_URL: string` (defaulted) — consumed by Task 3.

- [ ] **Step 1: Install the Resend SDK**

Run: `cd backend && npm install resend`

- [ ] **Step 2: Add the new env vars to the schema**

Edit `backend/src/config/env.js` — add these three fields inside the `z.object({...})` schema (after `TRUST_PROXY`, before the closing `})`):

```javascript
    // Optional: if unset, emailService logs the reset link to the console
    // instead of calling Resend — keeps local dev and tests working without
    // a real API key.
    RESEND_API_KEY: z.string().optional(),
    // Resend's shared sandbox sender — safe default for local/test; override
    // in production with a domain you've verified with Resend.
    FROM_EMAIL: z.string().optional().default('nextBooq <onboarding@resend.dev>'),
    // Used to build absolute links (e.g. password reset) in emails, since the
    // backend has no other way to know the frontend's public origin.
    FRONTEND_URL: z.string().optional().default('http://localhost:3000'),
```

- [ ] **Step 3: Document the new env vars**

Edit `backend/.env.example` — append at the end of the file:

```
# Resend API key for sending transactional email (password reset, etc.).
# Leave unset locally — emailService will log reset links to the console
# instead of sending real email.
RESEND_API_KEY=
# Sender address for transactional email. Defaults to Resend's shared
# sandbox sender if unset — replace with a domain verified in your Resend
# account before going to production.
FROM_EMAIL=nextBooq <onboarding@resend.dev>
# Public origin of the frontend, used to build links inside emails.
FRONTEND_URL=http://localhost:3000
```

- [ ] **Step 4: Write the failing unit test**

Create `backend/tests/unit/emailService.test.js`:

```javascript
describe('emailService', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('logs the reset link instead of sending when RESEND_API_KEY is unset', async () => {
    jest.doMock('../../src/config/env', () => ({
      RESEND_API_KEY: undefined,
      FROM_EMAIL: 'nextBooq <onboarding@resend.dev>',
    }));
    const { sendPasswordResetEmail } = require('../../src/services/emailService');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const result = await sendPasswordResetEmail({
      to: 'user@example.com',
      resetUrl: 'http://localhost:3000/auth/reset-password?token=abc',
    });

    expect(result.logged).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost:3000/auth/reset-password?token=abc')
    );
    logSpy.mockRestore();
  });

  test('calls the Resend SDK when RESEND_API_KEY is set', async () => {
    const sendMock = jest.fn().mockResolvedValue({ data: { id: 'email_123' }, error: null });
    jest.doMock('../../src/config/env', () => ({
      RESEND_API_KEY: 'test-key',
      FROM_EMAIL: 'nextBooq <onboarding@resend.dev>',
    }));
    jest.doMock('resend', () => ({
      Resend: jest.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
    }));
    const { sendPasswordResetEmail } = require('../../src/services/emailService');

    const result = await sendPasswordResetEmail({
      to: 'user@example.com',
      resetUrl: 'http://localhost:3000/auth/reset-password?token=abc',
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'nextBooq <onboarding@resend.dev>',
        to: 'user@example.com',
        subject: 'Reset your nextBooq password',
      })
    );
    expect(result.logged).toBe(false);
    expect(result.error).toBeNull();
  });

  test('logs an error but still returns without throwing when Resend returns an error', async () => {
    const sendMock = jest.fn().mockResolvedValue({ data: null, error: { message: 'provider down' } });
    jest.doMock('../../src/config/env', () => ({
      RESEND_API_KEY: 'test-key',
      FROM_EMAIL: 'nextBooq <onboarding@resend.dev>',
    }));
    jest.doMock('resend', () => ({
      Resend: jest.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
    }));
    const { sendPasswordResetEmail } = require('../../src/services/emailService');
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await sendPasswordResetEmail({
      to: 'user@example.com',
      resetUrl: 'http://localhost:3000/auth/reset-password?token=abc',
    });

    expect(result.error).toEqual({ message: 'provider down' });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd backend && npx jest tests/unit/emailService.test.js`
Expected: FAIL — `Cannot find module '../../src/services/emailService'`

- [ ] **Step 6: Write the implementation**

Create `backend/src/services/emailService.js`:

```javascript
const { Resend } = require('resend');
const config = require('../config/env');

const sendPasswordResetEmail = async ({ to, resetUrl }) => {
  if (!config.RESEND_API_KEY) {
    console.log(
      `[emailService] RESEND_API_KEY not set — logging reset link instead of sending. to=${to} resetUrl=${resetUrl}`
    );
    return { logged: true, data: null, error: null };
  }

  const resend = new Resend(config.RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from: config.FROM_EMAIL,
    to,
    subject: 'Reset your nextBooq password',
    html: `
      <p>We received a request to reset your nextBooq password.</p>
      <p><a href="${resetUrl}">Click here to reset your password</a></p>
      <p>This link expires in 30 minutes. If you didn't request this, you can safely ignore this email.</p>
    `,
  });

  if (error) {
    console.error('[emailService] Failed to send password reset email:', error);
  }

  return { logged: false, data, error };
};

module.exports = { sendPasswordResetEmail };
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd backend && npx jest tests/unit/emailService.test.js`
Expected: PASS (3 tests)

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/services/emailService.js backend/src/config/env.js backend/.env.example backend/tests/unit/emailService.test.js
git commit -m "feat: add Resend-backed email service for transactional email"
```

---

## Task 2: Backend — reset token fields and hashing utility

**Files:**
- Modify: `backend/src/models/User.js`
- Create: `backend/src/utils/passwordReset.js`
- Test: `backend/tests/unit/passwordReset.test.js`

**Interfaces:**
- Produces: `generateResetToken(): { rawToken: string, tokenHash: string, expiresAt: Date }` and `hashResetToken(rawToken: string): string` — consumed by Task 3's controller.
- Produces (model): `User.password_reset_token_hash: string | null`, `User.password_reset_expires_at: Date | null`.

- [ ] **Step 1: Write the failing unit test**

Create `backend/tests/unit/passwordReset.test.js`:

```javascript
const { generateResetToken, hashResetToken, RESET_TOKEN_TTL_MS } = require('../../src/utils/passwordReset');

describe('passwordReset token utility', () => {
  test('generateResetToken returns a raw token whose hash matches tokenHash', () => {
    const { rawToken, tokenHash } = generateResetToken();
    expect(hashResetToken(rawToken)).toBe(tokenHash);
  });

  test('generateResetToken sets an expiry roughly 30 minutes in the future', () => {
    const before = Date.now();
    const { expiresAt } = generateResetToken();
    const after = Date.now();
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + RESET_TOKEN_TTL_MS - 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + RESET_TOKEN_TTL_MS + 1000);
  });

  test('two generated tokens are different', () => {
    const a = generateResetToken();
    const b = generateResetToken();
    expect(a.rawToken).not.toBe(b.rawToken);
  });

  test('hashResetToken is deterministic', () => {
    expect(hashResetToken('abc123')).toBe(hashResetToken('abc123'));
  });

  test('hashResetToken differs for different inputs', () => {
    expect(hashResetToken('abc123')).not.toBe(hashResetToken('xyz789'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/unit/passwordReset.test.js`
Expected: FAIL — `Cannot find module '../../src/utils/passwordReset'`

- [ ] **Step 3: Write the implementation**

Create `backend/src/utils/passwordReset.js`:

```javascript
const crypto = require('crypto');

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

const hashResetToken = (rawToken) => crypto.createHash('sha256').update(rawToken).digest('hex');

const generateResetToken = () => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  return { rawToken, tokenHash, expiresAt };
};

module.exports = { generateResetToken, hashResetToken, RESET_TOKEN_TTL_MS };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest tests/unit/passwordReset.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Add the fields to the User model**

Edit `backend/src/models/User.js` — add these two fields to `userSchema`, right after the existing `is_platform_admin` field (before the closing `},` of the schema definition object at line 65):

```javascript
    // Single-use, hashed, time-limited password reset token. Never stores
    // the raw token — only its SHA-256 hash (see backend/src/utils/passwordReset.js).
    // Cleared on successful reset, or overwritten by a newer forgot-password
    // request (only the most recent request's token is ever valid).
    password_reset_token_hash: {
      type: String,
      default: null,
    },
    password_reset_expires_at: {
      type: Date,
      default: null,
    },
```

- [ ] **Step 6: Run the full backend suite to confirm no regressions**

Run: `cd backend && npx jest`
Expected: only the known, pre-existing 12 failures in `tests/integration/reservationLogicRuthless.test.js` (hardcoded past dates, unrelated to this change) — no new failures.

- [ ] **Step 7: Commit**

```bash
git add backend/src/utils/passwordReset.js backend/tests/unit/passwordReset.test.js backend/src/models/User.js
git commit -m "feat: add hashed reset token fields to User and a token utility"
```

---

## Task 3: Backend — forgot-password and reset-password endpoints

**Files:**
- Modify: `backend/src/controllers/authController.js`
- Modify: `backend/src/routes/v1/authRoutes.js`
- Test: `backend/tests/integration/passwordReset.test.js`

**Interfaces:**
- Consumes: `generateResetToken`, `hashResetToken` (Task 2, `backend/src/utils/passwordReset.js`); `sendPasswordResetEmail` (Task 1, `backend/src/services/emailService.js`); `config.FRONTEND_URL` (Task 1).
- Produces: `POST /api/v1/auth/forgot-password` (body `{ email }`) → always `{ status: 'success', message: string }`. `POST /api/v1/auth/reset-password` (body `{ token, password }`) → `{ status: 'success', message: string }` on success, `400` on any invalid/expired/reused token or weak password.

- [ ] **Step 1: Write the failing integration tests**

Create `backend/tests/integration/passwordReset.test.js`:

```javascript
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');
const { hashResetToken } = require('../../src/utils/passwordReset');

jest.mock('../../src/services/emailService', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
}));
const { sendPasswordResetEmail } = require('../../src/services/emailService');

setupTestDB();

describe('Password reset flow', () => {
  beforeEach(() => {
    sendPasswordResetEmail.mockClear();
  });

  test('forgot-password stores a hashed token and calls the email service for an existing account', async () => {
    const password_hash = await bcrypt.hash('OriginalPassword1!', 10);
    const user = await User.create({
      name: 'Reset Me',
      email: 'reset-flow@example.com',
      phone: '+15550300001',
      password_hash,
    });

    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'reset-flow@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account exists/i);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail.mock.calls[0][0].to).toBe('reset-flow@example.com');

    const updated = await User.findById(user._id);
    expect(updated.password_reset_token_hash).toBeTruthy();
    expect(updated.password_reset_expires_at).toBeTruthy();
    expect(updated.password_reset_expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  test('forgot-password returns the same generic response for a non-existent email and does not call the email service', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'no-such-account@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account exists/i);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  test('forgot-password rejects a missing email with 400', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password').send({});
    expect(res.status).toBe(400);
  });

  test('reset-password with a valid token changes the password and the old password no longer works', async () => {
    const password_hash = await bcrypt.hash('OriginalPassword1!', 10);
    const user = await User.create({
      name: 'Reset Valid',
      email: 'reset-valid@example.com',
      phone: '+15550300002',
      password_hash,
    });

    const rawToken = 'a'.repeat(64);
    await User.findByIdAndUpdate(user._id, {
      password_reset_token_hash: hashResetToken(rawToken),
      password_reset_expires_at: new Date(Date.now() + 30 * 60 * 1000),
    });

    const resetRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, password: 'BrandNewPassword1!' });

    expect(resetRes.status).toBe(200);

    const loginOld = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'reset-valid@example.com', password: 'OriginalPassword1!' });
    expect(loginOld.status).toBe(401);

    const loginNew = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'reset-valid@example.com', password: 'BrandNewPassword1!' });
    expect(loginNew.status).toBe(200);
  });

  test('reset-password rejects an expired token with 400', async () => {
    const password_hash = await bcrypt.hash('OriginalPassword1!', 10);
    const user = await User.create({
      name: 'Reset Expired',
      email: 'reset-expired@example.com',
      phone: '+15550300003',
      password_hash,
    });

    const rawToken = 'b'.repeat(64);
    await User.findByIdAndUpdate(user._id, {
      password_reset_token_hash: hashResetToken(rawToken),
      password_reset_expires_at: new Date(Date.now() - 60 * 1000),
    });

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, password: 'BrandNewPassword1!' });

    expect(res.status).toBe(400);
  });

  test('reset-password rejects reusing an already-used token', async () => {
    const password_hash = await bcrypt.hash('OriginalPassword1!', 10);
    const user = await User.create({
      name: 'Reset Reuse',
      email: 'reset-reuse@example.com',
      phone: '+15550300004',
      password_hash,
    });

    const rawToken = 'c'.repeat(64);
    await User.findByIdAndUpdate(user._id, {
      password_reset_token_hash: hashResetToken(rawToken),
      password_reset_expires_at: new Date(Date.now() + 30 * 60 * 1000),
    });

    const first = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, password: 'BrandNewPassword1!' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, password: 'AnotherPassword1!' });
    expect(second.status).toBe(400);
  });

  test('reset-password rejects a malformed/unknown token with 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'not-a-real-token', password: 'BrandNewPassword1!' });
    expect(res.status).toBe(400);
  });

  test('reset-password rejects a weak password with 400', async () => {
    const password_hash = await bcrypt.hash('OriginalPassword1!', 10);
    const user = await User.create({
      name: 'Reset Weak',
      email: 'reset-weak@example.com',
      phone: '+15550300005',
      password_hash,
    });

    const rawToken = 'd'.repeat(64);
    await User.findByIdAndUpdate(user._id, {
      password_reset_token_hash: hashResetToken(rawToken),
      password_reset_expires_at: new Date(Date.now() + 30 * 60 * 1000),
    });

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, password: 'short' });

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest tests/integration/passwordReset.test.js`
Expected: FAIL — 404s (routes don't exist yet)

- [ ] **Step 3: Implement the controller functions**

Edit `backend/src/controllers/authController.js` — add these imports near the top (after the existing `getOwnedOrgId` import on line 8):

```javascript
const { generateResetToken, hashResetToken } = require('../utils/passwordReset');
const { sendPasswordResetEmail } = require('../services/emailService');
```

Add these two functions after `logoutUser` (after line 202, before `customerQuickAuth`):

```javascript
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      throw new BadRequestError('Email is required');
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });

    if (user) {
      const { rawToken, tokenHash, expiresAt } = generateResetToken();
      user.password_reset_token_hash = tokenHash;
      user.password_reset_expires_at = expiresAt;
      await user.save();

      const resetUrl = `${config.FRONTEND_URL}/auth/reset-password?token=${rawToken}`;
      await sendPasswordResetEmail({ to: user.email, resetUrl });

      await logAuditEvent({
        cafeId: null,
        entityType: 'User',
        entityId: user._id,
        action: 'PASSWORD_RESET_REQUESTED',
        performedByUserId: user._id,
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'If an account exists for that email, a reset link has been sent.',
    });
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || typeof token !== 'string') {
      throw new BadRequestError('Reset token is required');
    }
    if (!password || typeof password !== 'string') {
      throw new BadRequestError('New password is required');
    }
    assertPasswordStrength(password);

    const tokenHash = hashResetToken(token);
    const user = await User.findOne({
      password_reset_token_hash: tokenHash,
      password_reset_expires_at: { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestError('This reset link is invalid or has expired.');
    }

    const salt = await bcrypt.genSalt(10);
    user.password_hash = await bcrypt.hash(password, salt);
    user.password_reset_token_hash = null;
    user.password_reset_expires_at = null;
    await user.save();

    await logAuditEvent({
      cafeId: null,
      entityType: 'User',
      entityId: user._id,
      action: 'PASSWORD_RESET',
      performedByUserId: user._id,
    });

    res.status(200).json({
      status: 'success',
      message: 'Password updated. You can now log in.',
    });
  } catch (error) {
    next(error);
  }
};
```

Update the `module.exports` at the bottom of the file to include the two new functions:

```javascript
module.exports = {
  registerUser,
  loginUser,
  getMe,
  logoutUser,
  forgotPassword,
  resetPassword,
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
  customerQuickAuth,
  getSocketToken,
} = require('../../controllers/authController');
const { authenticate } = require('../../middleware/auth');
const { authRateLimiter } = require('../../middleware/rateLimiter');

router.post('/register', authRateLimiter, registerUser);
router.post('/login', authRateLimiter, loginUser);
router.post('/forgot-password', authRateLimiter, forgotPassword);
router.post('/reset-password', authRateLimiter, resetPassword);
router.post('/customer-quick-auth', authRateLimiter, customerQuickAuth);
router.get('/me', authenticate, getMe);
router.post('/logout', logoutUser);
router.get('/socket-token', authenticate, getSocketToken);

module.exports = router;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx jest tests/integration/passwordReset.test.js`
Expected: PASS (8 tests)

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && npx jest`
Expected: only the known, pre-existing 12 failures in `reservationLogicRuthless.test.js` — no new failures.

- [ ] **Step 7: Commit**

```bash
git add backend/src/controllers/authController.js backend/src/routes/v1/authRoutes.js backend/tests/integration/passwordReset.test.js
git commit -m "feat: add forgot-password and reset-password endpoints"
```

---

## Task 4: Frontend — forgot-password page

**Files:**
- Create: `frontend/src/hooks/auth/use-forgot-password.ts`
- Create: `frontend/src/app/(control-plane)/auth/forgot-password/page.tsx`
- Create: `frontend/src/app/(control-plane)/auth/forgot-password/page.test.tsx`
- Modify: `frontend/src/app/(control-plane)/auth/login/page.tsx`
- Create: `frontend/src/app/(control-plane)/auth/login/page.test.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/auth/forgot-password` (Task 3).
- Produces: `useForgotPassword()` mutation hook — `mutate({ email: string }, { onSuccess, onError })`.

Note: this endpoint's response is `{ status: 'success', message: string }` — no nested `data` payload — so its hook types the response directly rather than reusing the `ApiResponse<T>` wrapper used by hooks like `use-login.ts` (whose backend responses nest a real payload under `data`).

- [ ] **Step 1: Write the failing hook usage test (page test) and the login page link test**

Create `frontend/src/app/(control-plane)/auth/forgot-password/page.test.tsx`:

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ForgotPasswordPage from './page';

const mutateMock = vi.fn();
vi.mock('@/hooks/auth/use-forgot-password', () => ({
  useForgotPassword: () => ({ mutate: mutateMock, isPending: false }),
}));

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    mutateMock.mockReset();
  });

  test('submits the entered email to the mutation', () => {
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByPlaceholderText('name@cafe.com'), { target: { value: 'someone@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(mutateMock).toHaveBeenCalledWith(
      { email: 'someone@example.com' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  test('shows the generic confirmation message after a successful submission', async () => {
    mutateMock.mockImplementation((_payload, { onSuccess }) => onSuccess());
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByPlaceholderText('name@cafe.com'), { target: { value: 'someone@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => expect(screen.getByText(/we've sent a reset link/i)).toBeInTheDocument());
  });

  test('shows the same generic confirmation message even when the mutation errors, to avoid leaking account existence', async () => {
    mutateMock.mockImplementation((_payload, { onError }) => onError());
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByPlaceholderText('name@cafe.com'), { target: { value: 'someone@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => expect(screen.getByText(/we've sent a reset link/i)).toBeInTheDocument());
  });

  test('has a link back to the login page', () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByRole('link', { name: /back to login/i })).toHaveAttribute('href', '/auth/login');
  });
});
```

Create `frontend/src/app/(control-plane)/auth/login/page.test.tsx`:

```typescript
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import LoginPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/auth/use-login', () => ({
  useLogin: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('LoginPage', () => {
  test('has a link to the forgot-password page', () => {
    render(<LoginPage />);
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute('href', '/auth/forgot-password');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run "src/app/(control-plane)/auth/forgot-password/page.test.tsx" "src/app/(control-plane)/auth/login/page.test.tsx"`
Expected: FAIL — `Cannot find module './page'` for the forgot-password test; the login test fails because no "Forgot password" link exists yet.

- [ ] **Step 3: Add the hook**

Create `frontend/src/hooks/auth/use-forgot-password.ts`:

```typescript
import { useMutation } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';

export interface ForgotPasswordPayload {
  email: string;
}

interface ForgotPasswordResponse {
  message: string;
}

export const useForgotPassword = () => {
  return useMutation({
    mutationFn: async (payload: ForgotPasswordPayload) => {
      const { data } = await axiosInstance.post<ForgotPasswordResponse>('/api/v1/auth/forgot-password', payload);
      return data;
    },
  });
};
```

- [ ] **Step 4: Add the forgot-password page**

Create `frontend/src/app/(control-plane)/auth/forgot-password/page.tsx`:

```typescript
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Coffee, ArrowRight, Loader2, Mail } from 'lucide-react';
import { useForgotPassword } from '@/hooks/auth/use-forgot-password';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const forgotPasswordMutation = useForgotPassword();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    forgotPasswordMutation.mutate(
      { email },
      {
        onSuccess: () => setSubmitted(true),
        onError: () => setSubmitted(true),
      }
    );
  };

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
            <h1 className="font-display text-3xl font-bold text-brand-brown">Reset your password</h1>
            <p className="font-sans text-brand-mocha text-sm mt-1">
              Enter your email and we&apos;ll send you a reset link.
            </p>
          </div>

          {submitted ? (
            <p className="font-sans text-brand-brown text-sm text-center bg-brand-tan/40 rounded-xl p-4">
              If an account exists for that email, we&apos;ve sent a reset link. Check your inbox.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              <div>
                <label className="block text-sm font-semibold text-brand-brown mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-5 h-5 text-brand-mocha absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="name@cafe.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-brand-brown/20 bg-white/80 focus:bg-white focus:ring-2 focus:ring-brand-red focus:outline-none transition-all text-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={forgotPasswordMutation.isPending}
                className="w-full cta-hero py-3.5 justify-center mt-2 text-base font-semibold shadow-brand-md"
              >
                {forgotPasswordMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Sending...
                  </>
                ) : (
                  <>
                    Send Reset Link <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </button>
            </form>
          )}

          <p className="font-sans text-brand-mocha text-sm text-center">
            <Link href="/auth/login" className="text-brand-red font-semibold hover:underline">
              Back to login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add the "Forgot password?" link to the login page**

Edit `frontend/src/app/(control-plane)/auth/login/page.tsx` — replace:

```typescript
      <div>
        <label className="block text-sm font-semibold text-brand-brown mb-1.5">
          Password
        </label>
        <div className="relative" suppressHydrationWarning>
```

with:

```typescript
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-sm font-semibold text-brand-brown">
            Password
          </label>
          <Link href="/auth/forgot-password" className="text-xs font-medium text-brand-red hover:underline">
            Forgot password?
          </Link>
        </div>
        <div className="relative" suppressHydrationWarning>
```

(`Link` is already imported at the top of this file — no import change needed.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run "src/app/(control-plane)/auth/forgot-password/page.test.tsx" "src/app/(control-plane)/auth/login/page.test.tsx"`
Expected: PASS (4 tests in forgot-password, 1 test in login)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/hooks/auth/use-forgot-password.ts "frontend/src/app/(control-plane)/auth/forgot-password/page.tsx" "frontend/src/app/(control-plane)/auth/forgot-password/page.test.tsx" "frontend/src/app/(control-plane)/auth/login/page.tsx" "frontend/src/app/(control-plane)/auth/login/page.test.tsx"
git commit -m "feat: add forgot-password page and link it from login"
```

---

## Task 5: Frontend — reset-password page

**Files:**
- Create: `frontend/src/hooks/auth/use-reset-password.ts`
- Create: `frontend/src/app/(control-plane)/auth/reset-password/page.tsx`
- Create: `frontend/src/app/(control-plane)/auth/reset-password/page.test.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/auth/reset-password` (Task 3).
- Produces: `useResetPassword()` mutation hook — `mutate({ token: string, password: string }, { onSuccess, onError })`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/(control-plane)/auth/reset-password/page.test.tsx`:

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ResetPasswordPage from './page';

let searchParamsValue = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsValue,
}));

const mutateMock = vi.fn();
vi.mock('@/hooks/auth/use-reset-password', () => ({
  useResetPassword: () => ({ mutate: mutateMock, isPending: false }),
}));

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    mutateMock.mockReset();
    searchParamsValue = new URLSearchParams();
  });

  test('shows an invalid-link message when there is no token in the URL', () => {
    render(<ResetPasswordPage />);
    expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument();
    expect(mutateMock).not.toHaveBeenCalled();
  });

  test('submits the token and new password to the mutation', () => {
    searchParamsValue = new URLSearchParams('token=abc123');
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'BrandNewPassword1!' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    expect(mutateMock).toHaveBeenCalledWith(
      { token: 'abc123', password: 'BrandNewPassword1!' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  test('shows a success message and login link after a successful reset', async () => {
    searchParamsValue = new URLSearchParams('token=abc123');
    mutateMock.mockImplementation((_payload, { onSuccess }) => onSuccess());
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'BrandNewPassword1!' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => expect(screen.getByText(/password updated/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /go to login/i })).toHaveAttribute('href', '/auth/login');
  });

  test('shows an inline error when the mutation fails (expired/invalid/reused token)', async () => {
    searchParamsValue = new URLSearchParams('token=abc123');
    mutateMock.mockImplementation((_payload, { onError }) => onError());
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'BrandNewPassword1!' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run "src/app/(control-plane)/auth/reset-password/page.test.tsx"`
Expected: FAIL — `Cannot find module './page'`

- [ ] **Step 3: Add the hook**

Create `frontend/src/hooks/auth/use-reset-password.ts`:

```typescript
import { useMutation } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';

export interface ResetPasswordPayload {
  token: string;
  password: string;
}

interface ResetPasswordResponse {
  message: string;
}

export const useResetPassword = () => {
  return useMutation({
    mutationFn: async (payload: ResetPasswordPayload) => {
      const { data } = await axiosInstance.post<ResetPasswordResponse>('/api/v1/auth/reset-password', payload);
      return data;
    },
  });
};
```

- [ ] **Step 4: Add the reset-password page**

Create `frontend/src/app/(control-plane)/auth/reset-password/page.tsx`:

```typescript
'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Coffee, ArrowRight, Loader2, Lock, Eye, EyeOff } from 'lucide-react';
import { useResetPassword } from '@/hooks/auth/use-reset-password';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const resetPasswordMutation = useResetPassword();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setErrorMessage(null);
    resetPasswordMutation.mutate(
      { token, password },
      {
        onSuccess: () => setSucceeded(true),
        onError: () => setErrorMessage('This reset link is invalid or has expired.'),
      }
    );
  };

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <p className="font-sans text-brand-brown text-sm bg-brand-tan/40 rounded-xl p-4">
          This reset link is invalid or has expired.
        </p>
        <Link href="/auth/forgot-password" className="text-brand-red font-semibold hover:underline text-sm">
          Request a new link
        </Link>
      </div>
    );
  }

  if (succeeded) {
    return (
      <div className="space-y-4 text-center">
        <p className="font-sans text-brand-brown text-sm bg-brand-tan/40 rounded-xl p-4">
          Password updated. You can now log in.
        </p>
        <Link href="/auth/login" className="text-brand-red font-semibold hover:underline text-sm">
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      <div>
        <label className="block text-sm font-semibold text-brand-brown mb-1.5">
          New Password
        </label>
        <div className="relative">
          <Lock className="w-5 h-5 text-brand-mocha absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type={showPassword ? 'text' : 'password'}
            required
            minLength={8}
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full pl-10 pr-10 py-3 rounded-xl border border-brand-brown/20 bg-white/80 focus:bg-white focus:ring-2 focus:ring-brand-red focus:outline-none transition-all text-sm"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-mocha hover:text-brand-brown"
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

      <button
        type="submit"
        disabled={resetPasswordMutation.isPending}
        className="w-full cta-hero py-3.5 justify-center mt-2 text-base font-semibold shadow-brand-md"
      >
        {resetPasswordMutation.isPending ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Updating...
          </>
        ) : (
          <>
            Update Password <ArrowRight className="w-4 h-4 ml-1" />
          </>
        )}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
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
            <h1 className="font-display text-3xl font-bold text-brand-brown">Set a new password</h1>
          </div>

          <Suspense fallback={<div className="p-8 text-center text-xs text-brand-mocha animate-pulse">Loading...</div>}>
            <ResetPasswordForm />
          </Suspense>
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

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run "src/app/(control-plane)/auth/reset-password/page.test.tsx"`
Expected: PASS (4 tests)

- [ ] **Step 6: Run the full frontend test suite and type-check**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS, no new type errors.

- [ ] **Step 7: Manual verification in the browser**

Start the dev servers (backend + frontend, with `RESEND_API_KEY` left unset so links log to the console instead of sending real email). Confirm:
- `/auth/login` shows a "Forgot password?" link.
- Submitting `/auth/forgot-password` with a real account's email always shows the generic confirmation message; check the backend console for the logged reset link.
- Opening that logged link (`/auth/reset-password?token=...`) shows the new-password form; submitting a new password succeeds, and logging in with the old password now fails while the new one works.
- Opening `/auth/reset-password` with no `token` query param shows the invalid-link state immediately.
- Submitting the same reset link a second time shows the invalid-link error.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/hooks/auth/use-reset-password.ts "frontend/src/app/(control-plane)/auth/reset-password/page.tsx" "frontend/src/app/(control-plane)/auth/reset-password/page.test.tsx"
git commit -m "feat: add reset-password page"
```
