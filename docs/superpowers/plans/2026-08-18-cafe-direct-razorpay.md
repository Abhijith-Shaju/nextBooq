# Cafe-owned Razorpay accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each cafe use its own Razorpay account for reservation deposits, so money never passes through the platform's account, replacing the single shared Razorpay credentials with per-cafe encrypted credentials.

**Architecture:** Each `Cafe` document gets an encrypted `payments` sub-document (Key ID, encrypted Key Secret, encrypted webhook secret, a `configured` flag). A new `createRazorpayClient(credentials)` factory replaces the old shared singleton everywhere a Razorpay SDK instance is needed. Checkout is gated client- and server-side on `configured`; webhooks move to a per-cafe route verified against that cafe's own secret.

**Tech Stack:** Node/Express/Mongoose backend, Next.js/React frontend, Jest + Supertest (backend), Vitest + Testing Library (frontend), Node's built-in `crypto` module for AES-256-GCM.

## Global Constraints

- All current reservation/payment data is test data — this is a clean cutover, no migration needed (per spec).
- No per-transaction platform fee — monetization is via `Cafe.subscription_status`, untouched by this work (per spec).
- `razorpay_key_secret_encrypted` and `razorpay_webhook_secret_encrypted` must never appear in any JSON response except the one-time plaintext webhook secret returned directly from the settings-save response body (per spec §"Cleanup" and this plan's Task 4 design).
- Old global `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET` config gets commented out, not deleted (per spec).
- In `NODE_ENV=development`, an unconfigured cafe still gets the existing mock-order fallback so local dev/testing isn't blocked (per spec).

---

### Task 1: Encryption utility

**Files:**
- Create: `backend/src/utils/encryption.js`
- Test: `backend/tests/unit/encryption.test.js`
- Modify: `backend/src/config/env.js` (add `ENCRYPTION_KEY`)
- Modify: `backend/.env`, `backend/.env.example` (add `ENCRYPTION_KEY`)

**Interfaces:**
- Produces: `encrypt(plaintext: string): string` — returns `"<ivHex>:<authTagHex>:<ciphertextHex>"`.
- Produces: `decrypt(encoded: string): string` — reverses `encrypt`, throws if the auth tag doesn't verify (tampered/corrupt/wrong key).

- [ ] **Step 1: Write the failing unit tests**

```javascript
// backend/tests/unit/encryption.test.js
const { encrypt, decrypt } = require('../../src/utils/encryption');

describe('encryption utility (AES-256-GCM)', () => {
  test('round-trips a plaintext string through encrypt then decrypt', () => {
    const plaintext = 'rzp_live_super_secret_key_12345';
    const encrypted = encrypt(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  test('produces a different ciphertext each time (random IV) for the same plaintext', () => {
    const plaintext = 'same input twice';
    const first = encrypt(plaintext);
    const second = encrypt(plaintext);

    expect(first).not.toBe(second);
    expect(decrypt(first)).toBe(plaintext);
    expect(decrypt(second)).toBe(plaintext);
  });

  test('throws when the ciphertext has been tampered with', () => {
    const encrypted = encrypt('some secret');
    const [iv, authTag, ciphertext] = encrypted.split(':');
    // Flip the last hex character of the ciphertext, keep iv/authTag identical.
    const tamperedCiphertext = ciphertext.slice(0, -1) + (ciphertext.slice(-1) === '0' ? '1' : '0');
    const tampered = `${iv}:${authTag}:${tamperedCiphertext}`;

    expect(() => decrypt(tampered)).toThrow();
  });

  test('throws on a malformed encoded string', () => {
    expect(() => decrypt('not-the-right-format')).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest tests/unit/encryption.test.js`
Expected: FAIL with "Cannot find module '../../src/utils/encryption'"

- [ ] **Step 3: Add `ENCRYPTION_KEY` to the env schema**

In `backend/src/config/env.js`, add to `INSECURE_DEFAULTS`:

```javascript
const INSECURE_DEFAULTS = {
  RAZORPAY_KEY_ID: 'rzp_test_key_id',
  RAZORPAY_KEY_SECRET: 'rzp_test_key_secret',
  RAZORPAY_WEBHOOK_SECRET: 'rzp_test_webhook_secret',
  ENCRYPTION_KEY: 'insecure_dev_only_encryption_key_32b',
};
```

Add to the schema object (after `RAZORPAY_WEBHOOK_SECRET`):

```javascript
    // 32-byte key (any string is fine — encryption.js hashes it down to 32
    // bytes via SHA-256) for AES-256-GCM encryption of per-cafe Razorpay
    // credentials at rest. Must be set to a real random value in production,
    // same as the RAZORPAY_* secrets below.
    ENCRYPTION_KEY: z.string().optional().default(INSECURE_DEFAULTS.ENCRYPTION_KEY),
```

The existing production `superRefine` loop already iterates `Object.entries(INSECURE_DEFAULTS)`, so adding this key to that object is enough to make production boot fail if it's left at the default — no other change needed there.

- [ ] **Step 4: Implement the encryption utility**

```javascript
// backend/src/utils/encryption.js
const crypto = require('crypto');
const config = require('../config/env');

// AES-256-GCM needs a 32-byte key. ENCRYPTION_KEY may be any length/format
// (a passphrase, a hex string, etc.) so it's hashed down to exactly 32 bytes
// via SHA-256 rather than requiring the operator to generate key bytes in a
// specific encoding.
const getKey = () => crypto.createHash('sha256').update(config.ENCRYPTION_KEY).digest();

const IV_LENGTH = 12; // recommended IV length for GCM

const encrypt = (plaintext) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
};

const decrypt = (encoded) => {
  const parts = typeof encoded === 'string' ? encoded.split(':') : [];
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted value');
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
};

module.exports = { encrypt, decrypt };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx jest tests/unit/encryption.test.js`
Expected: PASS, 4 tests

- [ ] **Step 6: Add `ENCRYPTION_KEY` to local env files**

In `backend/.env`, add a real random value (not the insecure default):

```bash
ENCRYPTION_KEY=b17f6c9e2a4d8091c3e5f7a9b1d3e5f7a9c1e3f5b7d9e1f3a5c7e9f1b3d5e7f9
```

In `backend/.env.example`, document it:

```bash
# 32-byte key (any string; hashed to 32 bytes internally) used to encrypt
# each cafe's Razorpay Key Secret and webhook secret at rest. Generate with:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/utils/encryption.js backend/tests/unit/encryption.test.js backend/src/config/env.js backend/.env.example
git commit -m "feat: add AES-256-GCM encryption utility for per-cafe payment credentials"
```

---

### Task 2: `Cafe` model — `payments` sub-document

**Files:**
- Modify: `backend/src/models/Cafe.js`
- Test: `backend/tests/unit/cafePaymentsModel.test.js`

**Interfaces:**
- Produces: `Cafe.payments = { razorpay_key_id: string, razorpay_key_secret_encrypted: string, razorpay_webhook_secret_encrypted: string, configured: boolean }`, defaulting to `{ razorpay_key_id: '', razorpay_key_secret_encrypted: '', razorpay_webhook_secret_encrypted: '', configured: false }`.
- Produces: `cafe.toJSON()` / `cafe.toObject({ getters: true })` (as used by Express's `res.json`) always omits `payments.razorpay_key_secret_encrypted` and `payments.razorpay_webhook_secret_encrypted`.

- [ ] **Step 1: Write the failing unit tests**

```javascript
// backend/tests/unit/cafePaymentsModel.test.js
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');

let replSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
}, 60000);

describe('Cafe model: payments sub-document', () => {
  test('defaults payments to an unconfigured, empty state', async () => {
    const org = await Organization.create({ name: 'Payments Model Org' });
    const cafe = await Cafe.create({ org_id: org._id, name: 'Model Cafe', slug: 'model-cafe', timezone: 'UTC' });

    expect(cafe.payments.razorpay_key_id).toBe('');
    expect(cafe.payments.configured).toBe(false);
  });

  test('toJSON strips the encrypted secret fields but keeps key_id and configured', async () => {
    const org = await Organization.create({ name: 'Payments Model Org 2' });
    const cafe = await Cafe.create({
      org_id: org._id,
      name: 'Model Cafe 2',
      slug: 'model-cafe-2',
      timezone: 'UTC',
      payments: {
        razorpay_key_id: 'rzp_test_visible',
        razorpay_key_secret_encrypted: 'iv:tag:ciphertext',
        razorpay_webhook_secret_encrypted: 'iv:tag:ciphertext2',
        configured: true,
      },
    });

    const json = cafe.toJSON();

    expect(json.payments.razorpay_key_id).toBe('rzp_test_visible');
    expect(json.payments.configured).toBe(true);
    expect(json.payments.razorpay_key_secret_encrypted).toBeUndefined();
    expect(json.payments.razorpay_webhook_secret_encrypted).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest tests/unit/cafePaymentsModel.test.js`
Expected: FAIL — `cafe.payments` is undefined (schema field doesn't exist yet)

- [ ] **Step 3: Add the `payments` field and `toJSON` transform**

In `backend/src/models/Cafe.js`, add after the `menu` field (before `subscription_status`):

```javascript
    payments: {
      razorpay_key_id: { type: String, trim: true, default: '' },
      razorpay_key_secret_encrypted: { type: String, default: '' },
      razorpay_webhook_secret_encrypted: { type: String, default: '' },
      configured: { type: Boolean, default: false },
    },
```

Then, right before `module.exports = mongoose.model('Cafe', cafeSchema);`, add:

```javascript
// Defense in depth: no response path (existing or future) should ever
// serialize the encrypted Razorpay credentials, even by accident. The
// one-time plaintext webhook secret shown right after a payments save is
// built separately by the controller — never sourced from this document.
cafeSchema.set('toJSON', {
  transform: (_doc, ret) => {
    if (ret.payments) {
      delete ret.payments.razorpay_key_secret_encrypted;
      delete ret.payments.razorpay_webhook_secret_encrypted;
    }
    return ret;
  },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest tests/unit/cafePaymentsModel.test.js`
Expected: PASS, 2 tests

- [ ] **Step 5: Run the full backend suite to check nothing else broke**

Run: `cd backend && npm test`
Expected: All passing (aside from any pre-existing flaky-under-parallel test unrelated to this change — re-run with `--runInBand` if anything fails, to confirm it's not a real regression)

- [ ] **Step 6: Commit**

```bash
git add backend/src/models/Cafe.js backend/tests/unit/cafePaymentsModel.test.js
git commit -m "feat: add payments sub-document to Cafe model"
```

---

### Task 3: Razorpay client factory + shared test mocking infrastructure

This replaces the single shared `config/razorpay.js` singleton with a factory function that builds a client from explicit credentials, and updates the test suite's mocking to match — before any real product code depends on it, so this task's own commit is independently verifiable (full suite still green) before Task 4/5 build on top.

**Files:**
- Modify: `backend/src/config/razorpay.js`
- Modify: `backend/tests/setup.js`
- Modify: `backend/tests/integration/depositAmountValidation.test.js`
- Modify: `backend/tests/integration/customerAuth.test.js`
- Modify: `backend/tests/integration/concurrencyBooking.test.js`
- Modify: `backend/tests/integration/reservationLogicRuthless.test.js`
- Modify: `backend/tests/e2e/bookingLifecycle.test.js`
- Modify: `backend/src/config/env.js`, `backend/.env`, `backend/.env.example` (comment out `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`)

**Interfaces:**
- Produces: `createRazorpayClient({ key_id, key_secret }): RazorpayInstance` — the only way any code in this app should construct a Razorpay SDK client from here on.
- Consumed by: Task 4 (credential validation), Task 5 (order creation / signature verification).

- [ ] **Step 1: Refactor `config/razorpay.js` into a factory**

```javascript
// backend/src/config/razorpay.js
const Razorpay = require('razorpay');

/**
 * Every Razorpay SDK client in this app is built from a specific cafe's own
 * credentials (see paymentService.js) — there is no shared platform-level
 * account anymore. This is the one place that constructs the SDK client, so
 * tests only need to mock this module instead of the `razorpay` package
 * itself everywhere it's used.
 */
const createRazorpayClient = ({ key_id, key_secret }) => new Razorpay({ key_id, key_secret });

module.exports = { createRazorpayClient };
```

- [ ] **Step 2: Update the global test mock in `tests/setup.js`**

Replace the existing `jest.mock('../src/config/razorpay', ...)` block with:

```javascript
// Mock the Razorpay client factory globally in test environment — every
// caller gets the same fake orders.create/payments.all behavior regardless
// of which cafe's credentials were passed in.
jest.mock('../src/config/razorpay', () => ({
  createRazorpayClient: jest.fn(() => ({
    orders: {
      create: jest.fn().mockImplementation(async (options) => ({
        id: `order_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        entity: 'order',
        amount: options.amount,
        currency: options.currency || 'INR',
        receipt: options.receipt,
        status: 'created',
        created_at: Math.floor(Date.now() / 1000),
      })),
    },
    payments: {
      all: jest.fn().mockResolvedValue({ entity: 'collection', count: 0, items: [] }),
    },
  })),
}));
```

- [ ] **Step 3: Update the five test files with local overrides of this mock**

In each of `backend/tests/integration/depositAmountValidation.test.js`, `backend/tests/integration/customerAuth.test.js`, `backend/tests/integration/concurrencyBooking.test.js`, `backend/tests/integration/reservationLogicRuthless.test.js`, and `backend/tests/e2e/bookingLifecycle.test.js`, replace their local `jest.mock('../../src/config/razorpay', ...)` (or `'../src/config/razorpay'` for the e2e file, matching its relative depth) block with the same shape as Step 2's global mock:

```javascript
jest.mock('../../src/config/razorpay', () => ({
  createRazorpayClient: jest.fn(() => ({
    orders: {
      create: jest.fn().mockImplementation(async (options) => ({
        id: `order_mock_${Date.now()}`,
        entity: 'order',
        amount: options.amount,
        currency: options.currency || 'INR',
        receipt: options.receipt,
        status: 'created',
        created_at: Math.floor(Date.now() / 1000),
      })),
    },
    payments: {
      all: jest.fn().mockResolvedValue({ entity: 'collection', count: 0, items: [] }),
    },
  })),
}));
```

(Keep each file's existing relative import path exactly as it already is — only the object shape inside the factory changes, from `{ orders: {...} }` to `{ createRazorpayClient: jest.fn(() => ({ orders: {...}, payments: {...} })) }`.)

- [ ] **Step 4: Comment out the now-unused global Razorpay env vars**

In `backend/src/config/env.js`, this task doesn't remove `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` from the schema yet — `RAZORPAY_WEBHOOK_SECRET` is still read by the old global webhook route until Task 7, and Task 5 still needs to run before the old `paymentService.js` code path stops referencing the config module at all. Skip this step here — it happens in Task 5 (key/secret) and Task 7 (webhook secret) once each is verifiably unused.

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && npm test`
Expected: All passing — this task changes only the client-construction mechanism and its test doubles, not any product behavior yet (nothing calls `createRazorpayClient` from product code until Task 4/5).

- [ ] **Step 6: Commit**

```bash
git add backend/src/config/razorpay.js backend/tests/setup.js backend/tests/integration/depositAmountValidation.test.js backend/tests/integration/customerAuth.test.js backend/tests/integration/concurrencyBooking.test.js backend/tests/integration/reservationLogicRuthless.test.js backend/tests/e2e/bookingLifecycle.test.js
git commit -m "refactor: replace shared Razorpay singleton with a per-call client factory"
```

---

### Task 4: Cafe settings — Payments credential validation & save

**Files:**
- Modify: `backend/src/controllers/admin/cafeController.js`
- Test: `backend/tests/integration/cafePaymentsSettings.test.js`

**Interfaces:**
- Consumes: `createRazorpayClient` (Task 3), `encrypt`/`decrypt` (Task 1).
- Produces: `PUT /api/v1/cafes/:cafeId` accepts an optional `payments: { razorpay_key_id, razorpay_key_secret }` body field. On success, response `data.payments = { razorpay_key_id, configured }` (no secrets) plus, only on a successful payments save, `data.payments_webhook = { url: string, secret: string }` (plaintext, one-time).

- [ ] **Step 1: Write the failing integration tests**

```javascript
// backend/tests/integration/cafePaymentsSettings.test.js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');
const { createRazorpayClient } = require('../../src/config/razorpay');

setupTestDB();

describe('Integration Test: cafe Payments settings (Razorpay credentials)', () => {
  let cafe;
  let ownerToken;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Payments Settings Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Payments Cafe',
      slug: 'payments-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });
    const owner = await User.create({
      name: 'Owner',
      email: 'owner-payments@test.com',
      phone: '+1555900002',
      password_hash: 'pass',
      staff_memberships: [{ cafe_id: cafe._id, role: 'owner', permissions: [] }],
    });
    ownerToken = jwt.sign({ id: owner._id.toString() }, config.JWT_SECRET);
    createRazorpayClient.mockClear();
  });

  const putSettings = (body) =>
    request(app).put(`/api/v1/cafes/${cafe._id}`).set('Authorization', `Bearer ${ownerToken}`).send(body);

  test('validates credentials against Razorpay before saving, and marks payments configured', async () => {
    const res = await putSettings({
      payments: { razorpay_key_id: 'rzp_test_valid123', razorpay_key_secret: 'supersecretvalue' },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.payments.razorpay_key_id).toBe('rzp_test_valid123');
    expect(res.body.data.payments.configured).toBe(true);
    expect(res.body.data.payments.razorpay_key_secret_encrypted).toBeUndefined();

    expect(createRazorpayClient).toHaveBeenCalledWith({
      key_id: 'rzp_test_valid123',
      key_secret: 'supersecretvalue',
    });

    const persisted = await Cafe.findById(cafe._id);
    expect(persisted.payments.configured).toBe(true);
    expect(persisted.payments.razorpay_key_secret_encrypted).not.toBe('supersecretvalue');
    expect(persisted.payments.razorpay_key_secret_encrypted.length).toBeGreaterThan(0);
  });

  test('returns a one-time plaintext webhook URL and secret only when payments were just saved', async () => {
    const res = await putSettings({
      payments: { razorpay_key_id: 'rzp_test_valid123', razorpay_key_secret: 'supersecretvalue' },
    });

    expect(res.body.data.payments_webhook.url).toBe(
      `${config.FRONTEND_URL}/api/v1/webhooks/razorpay/payments-cafe`
    );
    expect(typeof res.body.data.payments_webhook.secret).toBe('string');
    expect(res.body.data.payments_webhook.secret.length).toBeGreaterThan(0);
  });

  test('does not touch payments_webhook when the save has no payments field at all', async () => {
    const res = await putSettings({ description: 'just a description update' });

    expect(res.status).toBe(200);
    expect(res.body.data.payments_webhook).toBeUndefined();
  });

  test('rejects the whole save when credentials fail Razorpay validation, persisting nothing', async () => {
    createRazorpayClient.mockReturnValueOnce({
      payments: { all: jest.fn().mockRejectedValue(new Error('Unauthorized')) },
    });

    const res = await putSettings({
      payments: { razorpay_key_id: 'rzp_test_bad', razorpay_key_secret: 'wrongsecret' },
      description: 'should not be saved either',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/could not.*verif/i);

    const persisted = await Cafe.findById(cafe._id);
    expect(persisted.payments.configured).toBe(false);
    expect(persisted.description).toBe('');
  });

  test('rejects a payments update with only one of key_id/key_secret provided', async () => {
    const res = await putSettings({ payments: { razorpay_key_id: 'rzp_test_onlyid' } });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/razorpay_key_id.*razorpay_key_secret|razorpay_key_secret.*razorpay_key_id/i);
  });

  test('regenerates the webhook secret on a subsequent credentials replacement', async () => {
    const first = await putSettings({
      payments: { razorpay_key_id: 'rzp_test_first', razorpay_key_secret: 'firstsecret' },
    });
    const firstSecret = first.body.data.payments_webhook.secret;

    const second = await putSettings({
      payments: { razorpay_key_id: 'rzp_test_second', razorpay_key_secret: 'secondsecret' },
    });

    expect(second.body.data.payments.razorpay_key_id).toBe('rzp_test_second');
    expect(second.body.data.payments_webhook.secret).not.toBe(firstSecret);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest tests/integration/cafePaymentsSettings.test.js`
Expected: FAIL — `payments` is silently ignored by `updateCafe` today (no such handling exists), so `configured` stays `false` and `payments_webhook` is never present.

- [ ] **Step 3: Implement the validation & save logic**

In `backend/src/controllers/admin/cafeController.js`, add near the top (after the existing `isValidHttpsUrl` helper):

```javascript
const crypto = require('crypto');
const { encrypt, decrypt } = require('../../utils/encryption');
const { createRazorpayClient } = require('../../config/razorpay');
const config = require('../../config/env');

const validateRazorpayCredentials = async (razorpayKeyId, razorpayKeySecret) => {
  const client = createRazorpayClient({ key_id: razorpayKeyId, key_secret: razorpayKeySecret });
  try {
    await client.payments.all({ count: 1 });
  } catch {
    throw new BadRequestError(
      "These Razorpay credentials couldn't be verified. Double-check the Key ID and Key Secret from your Razorpay dashboard."
    );
  }
};
```

Then, inside `updateCafe`, extend the destructure and add handling (right after the `menu` block, before `await cafe.save()`):

```javascript
    const { reservation_rules, operating_hours, description, hero_image_url, menu, payments } = req.body;
```

```javascript
    let webhookReveal = null;

    if (payments !== undefined) {
      const { razorpay_key_id: razorpayKeyId, razorpay_key_secret: razorpayKeySecret } = payments || {};
      const hasKeyId = typeof razorpayKeyId === 'string' && razorpayKeyId.length > 0;
      const hasKeySecret = typeof razorpayKeySecret === 'string' && razorpayKeySecret.length > 0;

      if (hasKeyId !== hasKeySecret) {
        throw new BadRequestError('Both razorpay_key_id and razorpay_key_secret are required together');
      }

      if (hasKeyId && hasKeySecret) {
        await validateRazorpayCredentials(razorpayKeyId, razorpayKeySecret);

        const webhookSecretPlaintext = crypto.randomBytes(32).toString('hex');

        cafe.payments = {
          razorpay_key_id: razorpayKeyId,
          razorpay_key_secret_encrypted: encrypt(razorpayKeySecret),
          razorpay_webhook_secret_encrypted: encrypt(webhookSecretPlaintext),
          configured: true,
        };

        webhookReveal = {
          url: `${config.FRONTEND_URL}/api/v1/webhooks/razorpay/${cafe.slug}`,
          secret: webhookSecretPlaintext,
        };
      }
    }
```

And change the response block from:

```javascript
    res.status(200).json({
      status: 'success',
      data: cafe,
    });
```

to:

```javascript
    const responseData = cafe.toJSON();
    if (webhookReveal) {
      responseData.payments_webhook = webhookReveal;
    }

    res.status(200).json({
      status: 'success',
      data: responseData,
    });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest tests/integration/cafePaymentsSettings.test.js`
Expected: PASS, 6 tests

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && npm test`
Expected: All passing

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/admin/cafeController.js backend/tests/integration/cafePaymentsSettings.test.js
git commit -m "feat: validate and save per-cafe Razorpay credentials on settings save"
```

---

### Task 5: Payment flow — use each cafe's own Razorpay client

**Files:**
- Modify: `backend/src/services/paymentService.js`
- Modify: `backend/tests/integration/paymentVerification.test.js` (add `payments.configured` fixture)
- Modify: `backend/tests/integration/depositAmountValidation.test.js` (add `payments.configured` fixture)
- Modify: `backend/tests/integration/pendingPaymentExpiry.test.js` (add `payments.configured` fixture)
- Modify: `backend/src/config/env.js`, `backend/.env`, `backend/.env.example` (comment out `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`)
- Test: `backend/tests/integration/paymentServicePerCafeCredentials.test.js`

**Interfaces:**
- Consumes: `createRazorpayClient` (Task 3), `decrypt` (Task 1), `cafe.payments` (Task 2).
- Produces: `createOrderForReservation(reservationId, tenantId, amountInRupees)` throws `BadRequestError` when `cafe.payments.configured` is false and `NODE_ENV !== 'development'`; otherwise unchanged signature/behavior.
- Produces: `verifyCheckoutPayment({...})` — unchanged signature; internally verifies against the calling cafe's own decrypted key secret instead of the global one.

- [ ] **Step 1: Write the failing integration test for the new gating/client-selection behavior**

```javascript
// backend/tests/integration/paymentServicePerCafeCredentials.test.js
const Reservation = require('../../src/models/Reservation');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const Table = require('../../src/models/Table');
const { setupTestDB } = require('../setup');
const { createOrderForReservation } = require('../../src/services/paymentService');
const { encrypt } = require('../../src/utils/encryption');
const { createRazorpayClient } = require('../../src/config/razorpay');

setupTestDB();

const makeCafeAndHold = async ({ configured }) => {
  const org = await Organization.create({ name: 'Per-cafe Credentials Org' });
  const cafe = await Cafe.create({
    org_id: org._id,
    name: 'Per-cafe Credentials Cafe',
    slug: 'per-cafe-credentials',
    timezone: 'UTC',
    payments: configured
      ? {
          razorpay_key_id: 'rzp_test_thiscafe',
          razorpay_key_secret_encrypted: encrypt('thiscafe_secret'),
          razorpay_webhook_secret_encrypted: encrypt('thiscafe_webhook_secret'),
          configured: true,
        }
      : undefined,
  });
  const table = await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 2 });
  const reservation = await Reservation.create({
    cafe_id: cafe._id,
    user_id: new (require('mongoose').Types.ObjectId)(),
    table_ids: [table._id],
    start_time: new Date('2026-09-01T19:00:00Z'),
    end_time: new Date('2026-09-01T20:30:00Z'),
    party_size: 2,
    reservation_timezone: 'UTC',
    status: 'HOLD',
  });
  return { cafe, reservation };
};

describe('Integration Test: paymentService uses each cafe\'s own Razorpay credentials', () => {
  beforeEach(() => {
    createRazorpayClient.mockClear();
  });

  test('builds the Razorpay client from the cafe\'s own decrypted credentials', async () => {
    const { cafe, reservation } = await makeCafeAndHold({ configured: true });

    await createOrderForReservation(reservation._id, cafe._id, 100);

    expect(createRazorpayClient).toHaveBeenCalledWith({
      key_id: 'rzp_test_thiscafe',
      key_secret: 'thiscafe_secret',
    });
  });

  test('rejects order creation for an unconfigured cafe outside development', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { cafe, reservation } = await makeCafeAndHold({ configured: false });

      await expect(createOrderForReservation(reservation._id, cafe._id, 100)).rejects.toThrow(
        /payments/i
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/integration/paymentServicePerCafeCredentials.test.js`
Expected: FAIL — `createOrderForReservation` currently calls the old shared `razorpay.orders.create` directly (via the pre-Task-3 import shape) and never checks `cafe.payments`.

- [ ] **Step 3: Rewrite `paymentService.js` to use per-cafe credentials**

Replace the top of `backend/src/services/paymentService.js`:

```javascript
const crypto = require('crypto');
const { createRazorpayClient } = require('../config/razorpay');
const { decrypt } = require('../utils/encryption');
const Reservation = require('../models/Reservation');
const Cafe = require('../models/Cafe');
const { transitionState } = require('./stateMachine');
const { BadRequestError } = require('../utils/errors');
const config = require('../config/env');

const getRazorpayClientForCafe = (cafe) => {
  const keySecret = decrypt(cafe.payments.razorpay_key_secret_encrypted);
  return createRazorpayClient({ key_id: cafe.payments.razorpay_key_id, key_secret: keySecret });
};
```

In `createOrderForReservation`, right after `const cafe = await Cafe.findById(tenantId);`, add the gate:

```javascript
  if (!cafe?.payments?.configured && config.NODE_ENV !== 'development') {
    throw new BadRequestError("This cafe hasn't finished setting up payments yet.");
  }
```

Replace the `let order; try { order = await razorpay.orders.create(options); } catch (razorpayErr) { ... }` block's client construction: where it currently does `order = await razorpay.orders.create(options);`, change to building the client first:

```javascript
  let order;
  try {
    const client = cafe.payments?.configured ? getRazorpayClientForCafe(cafe) : null;
    if (!client) {
      // Only reachable in development for an unconfigured cafe (guarded above
      // for all other environments) — fall through to the existing mock path.
      throw new Error('No Razorpay client configured for this cafe (development mock fallback)');
    }
    order = await client.orders.create(options);
  } catch (razorpayErr) {
```

The existing `catch` block's mock-fallback logic (the `isAuthFail || config.NODE_ENV === 'development'` branch) is unchanged — it already produces a local mock order object, which is exactly the desired dev-mode behavior for an unconfigured cafe.

In `verifyCheckoutPayment`, replace the signature-check block:

```javascript
  const expectedSignature = crypto
    .createHmac('sha256', config.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
```

with:

```javascript
  const cafe = await Cafe.findById(tenantId);
  const keySecret = cafe?.payments?.configured
    ? decrypt(cafe.payments.razorpay_key_secret_encrypted)
    : config.RAZORPAY_KEY_SECRET; // development mock-order fallback keeps working

  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
```

(`verifyCheckoutPayment` already loads `reservation` via `Reservation.findOne({ _id: reservationId, cafe_id: tenantId })` earlier in the function — add the `Cafe.findById(tenantId)` call right after that, before the signature check.)

- [ ] **Step 4: Run the new test to verify it passes**

Run: `cd backend && npx jest tests/integration/paymentServicePerCafeCredentials.test.js`
Expected: PASS, 2 tests

- [ ] **Step 5: Update existing payment-flow test fixtures to include `payments.configured`**

In `backend/tests/integration/paymentVerification.test.js`, `backend/tests/integration/depositAmountValidation.test.js`, and `backend/tests/integration/pendingPaymentExpiry.test.js`, add `require('../../src/utils/encryption')` and update each `Cafe.create({...})` call to include:

```javascript
      payments: {
        razorpay_key_id: 'rzp_test_fixture',
        razorpay_key_secret_encrypted: encrypt('fixture_key_secret'),
        razorpay_webhook_secret_encrypted: encrypt('fixture_webhook_secret'),
        configured: true,
      },
```

(`paymentVerification.test.js` also signs its checkout-response HMAC with `config.RAZORPAY_KEY_SECRET` in `signCheckoutResponse` — change that constant to `'fixture_key_secret'`, matching the cafe fixture's now-per-cafe key secret, since `verifyCheckoutPayment` verifies against the decrypted per-cafe secret as of Step 3.)

- [ ] **Step 6: Comment out the now-unused global `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`**

In `backend/src/config/env.js`, comment out those two lines from `INSECURE_DEFAULTS` and the schema (keep `RAZORPAY_WEBHOOK_SECRET` — still used by the old global webhook route until Task 7):

```javascript
const INSECURE_DEFAULTS = {
  // RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET removed: every cafe now uses its
  // own Razorpay credentials (see Cafe.payments), so there's no platform-
  // level Razorpay account for the booking flow anymore. Left commented out
  // rather than deleted in case a platform-level account is needed later
  // for something unrelated (e.g. platform subscription billing).
  // RAZORPAY_KEY_ID: 'rzp_test_key_id',
  // RAZORPAY_KEY_SECRET: 'rzp_test_key_secret',
  RAZORPAY_WEBHOOK_SECRET: 'rzp_test_webhook_secret',
  ENCRYPTION_KEY: 'insecure_dev_only_encryption_key_32b',
};
```

```javascript
    // RAZORPAY_KEY_ID: z.string().optional().default(INSECURE_DEFAULTS.RAZORPAY_KEY_ID),
    // RAZORPAY_KEY_SECRET: z.string().optional().default(INSECURE_DEFAULTS.RAZORPAY_KEY_SECRET),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(INSECURE_DEFAULTS.RAZORPAY_WEBHOOK_SECRET),
```

In `backend/.env` and `backend/.env.example`, comment out the corresponding two lines the same way.

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && npm test`
Expected: All passing. If any test unexpectedly fails, re-run just that file with `--runInBand` before assuming it's a real regression (matches this project's known flaky-under-parallel-load pattern).

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/paymentService.js backend/tests/integration/paymentServicePerCafeCredentials.test.js backend/tests/integration/paymentVerification.test.js backend/tests/integration/depositAmountValidation.test.js backend/tests/integration/pendingPaymentExpiry.test.js backend/src/config/env.js backend/.env.example
git commit -m "feat: use each cafe's own Razorpay credentials for order creation and payment verification"
```

---

### Task 6: Block reservation holds for cafes without payments configured

**Files:**
- Modify: `backend/src/controllers/public/bookingController.js`
- Modify: `backend/tests/integration/concurrencyBooking.test.js` (add `payments.configured` fixture)
- Modify: `backend/tests/integration/reservationLogicRuthless.test.js` (add `payments.configured` fixture, where it creates reservations via the HTTP endpoint)
- Test: `backend/tests/integration/bookingBlockedWithoutPayments.test.js`

**Interfaces:**
- Consumes: `req.cafe.payments` (already populated by `extractTenant` middleware, since it loads the full `Cafe` document onto `req.cafe`).
- Produces: `POST /api/v1/cafes/:cafeId/reservations` returns `400` with a clear message when `req.cafe.payments?.configured` is false and not in development, before any `HOLD` reservation is created.

- [ ] **Step 1: Write the failing integration test**

```javascript
// backend/tests/integration/bookingBlockedWithoutPayments.test.js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const Reservation = require('../../src/models/Reservation');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Integration Test: booking is blocked for a cafe without payments configured', () => {
  let cafe;
  let token;

  const futureStartTime = () => {
    const d = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    d.setUTCHours(19, 0, 0, 0);
    return d.toISOString();
  };

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Unconfigured Payments Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Unconfigured Payments Cafe',
      slug: 'unconfigured-payments-cafe',
      timezone: 'UTC',
    });
    await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });
    const user = await User.create({
      name: 'Blocked Booker',
      email: 'blocked-booker@test.com',
      phone: '+1555900003',
      password_hash: 'pass',
    });
    token = jwt.sign({ id: user._id.toString() }, config.JWT_SECRET);
  });

  test('rejects hold creation in production when payments are not configured', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await request(app)
        .post(`/api/v1/cafes/${cafe._id}/reservations`)
        .set('Authorization', `Bearer ${token}`)
        .send({ start_time: futureStartTime(), party_size: 2 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/payments/i);

      const holds = await Reservation.find({ cafe_id: cafe._id });
      expect(holds).toHaveLength(0);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/integration/bookingBlockedWithoutPayments.test.js`
Expected: FAIL — `createReservation` currently creates the hold unconditionally; status would be `201`, not `400`.

- [ ] **Step 3: Add the gate to `createReservation`**

In `backend/src/controllers/public/bookingController.js`, add near the top:

```javascript
const config = require('../../config/env');
```

Right after the existing party-size/lead-time/duration/deposit validation block, before `// 1. Transactional HOLD reservation creation`, add:

```javascript
    if (!req.cafe.payments?.configured && config.NODE_ENV !== 'development') {
      throw new BadRequestError("This cafe hasn't finished setting up payments yet.");
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest tests/integration/bookingBlockedWithoutPayments.test.js`
Expected: PASS

- [ ] **Step 5: Update existing booking-flow test fixtures**

In `backend/tests/integration/concurrencyBooking.test.js` and `backend/tests/integration/reservationLogicRuthless.test.js` (wherever they `Cafe.create({...})` and then hit `POST /reservations`), add the same `payments: { configured: true, ... }` fixture block as Task 5 Step 5, importing `encrypt` from `../../src/utils/encryption`.

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && npm test`
Expected: All passing

- [ ] **Step 7: Commit**

```bash
git add backend/src/controllers/public/bookingController.js backend/tests/integration/bookingBlockedWithoutPayments.test.js backend/tests/integration/concurrencyBooking.test.js backend/tests/integration/reservationLogicRuthless.test.js
git commit -m "fix: block reservation holds for cafes that haven't configured payments"
```

---

### Task 7: Per-cafe webhook route

**Files:**
- Modify: `backend/src/controllers/webhookController.js`
- Modify: `backend/src/routes/v1/webhookRoutes.js`
- Modify: `backend/tests/integration/webhookSignatureVerification.test.js`
- Modify: `backend/tests/integration/webhookIdempotency.test.js`
- Modify: `backend/src/config/env.js`, `backend/.env`, `backend/.env.example` (comment out `RAZORPAY_WEBHOOK_SECRET`)
- Test: `backend/tests/integration/perCafeWebhook.test.js`

**Interfaces:**
- Produces: `POST /api/v1/webhooks/razorpay/:cafeSlug` — same event handling as the old global route, but verified against `Cafe.findOne({ slug: cafeSlug }).payments.razorpay_webhook_secret_encrypted` (decrypted) instead of `config.RAZORPAY_WEBHOOK_SECRET`.
- Removes: `POST /api/v1/webhooks/razorpay` (old global route).

- [ ] **Step 1: Write the failing integration test**

```javascript
// backend/tests/integration/perCafeWebhook.test.js
const request = require('supertest');
const crypto = require('crypto');
const app = require('../../src/app');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const Table = require('../../src/models/Table');
const User = require('../../src/models/User');
const Reservation = require('../../src/models/Reservation');
const { setupTestDB } = require('../setup');
const { encrypt } = require('../../src/utils/encryption');

setupTestDB();

describe('Integration Test: per-cafe Razorpay webhook', () => {
  let cafeA;
  let cafeB;
  let reservationA;
  const orderId = 'order_percafe_123456';
  const secretA = 'cafe_a_webhook_secret';
  const secretB = 'cafe_b_webhook_secret';

  const signRawBody = (rawBody, secret) => crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Per-cafe Webhook Org' });
    cafeA = await Cafe.create({
      org_id: org._id,
      name: 'Webhook Cafe A',
      slug: 'webhook-cafe-a',
      timezone: 'UTC',
      payments: {
        razorpay_key_id: 'rzp_test_a',
        razorpay_key_secret_encrypted: encrypt('cafe_a_key_secret'),
        razorpay_webhook_secret_encrypted: encrypt(secretA),
        configured: true,
      },
    });
    cafeB = await Cafe.create({
      org_id: org._id,
      name: 'Webhook Cafe B',
      slug: 'webhook-cafe-b',
      timezone: 'UTC',
      payments: {
        razorpay_key_id: 'rzp_test_b',
        razorpay_key_secret_encrypted: encrypt('cafe_b_key_secret'),
        razorpay_webhook_secret_encrypted: encrypt(secretB),
        configured: true,
      },
    });

    const user = await User.create({
      name: 'Webhook User',
      email: 'percafe-webhook@test.com',
      phone: '+1555900004',
      password_hash: 'pass',
    });
    const table = await Table.create({ cafe_id: cafeA._id, table_number: 'T1', capacity: 2 });
    reservationA = await Reservation.create({
      cafe_id: cafeA._id,
      user_id: user._id,
      table_ids: [table._id],
      start_time: new Date('2026-09-01T19:00:00Z'),
      end_time: new Date('2026-09-01T20:30:00Z'),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'PENDING_PAYMENT',
      payment_data: { order_id: orderId, amount: 100, currency: 'INR', webhook_processed: false },
    });
  });

  const rawBody = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_percafe_9999', order_id: orderId, status: 'captured' } } },
  });

  test("confirms the reservation when signed with that cafe's own webhook secret", async () => {
    const signature = signRawBody(rawBody, secretA);

    const res = await request(app)
      .post(`/api/v1/webhooks/razorpay/${cafeA.slug}`)
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(rawBody);

    expect(res.status).toBe(200);
    const updated = await Reservation.findById(reservationA._id);
    expect(updated.status).toBe('CONFIRMED');
  });

  test("rejects a signature computed with a different cafe's webhook secret", async () => {
    const signature = signRawBody(rawBody, secretB);

    const res = await request(app)
      .post(`/api/v1/webhooks/razorpay/${cafeA.slug}`)
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(rawBody);

    expect(res.status).toBe(400);
    const updated = await Reservation.findById(reservationA._id);
    expect(updated.status).toBe('PENDING_PAYMENT');
  });

  test('returns 404 for an unknown cafe slug', async () => {
    const signature = signRawBody(rawBody, secretA);

    const res = await request(app)
      .post('/api/v1/webhooks/razorpay/no-such-cafe')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(rawBody);

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/integration/perCafeWebhook.test.js`
Expected: FAIL — `POST /api/v1/webhooks/razorpay/:cafeSlug` doesn't exist yet (404 for all three cases, including the ones expecting 200/400).

- [ ] **Step 3: Add `:cafeSlug` handling to the webhook controller**

In `backend/src/controllers/webhookController.js`, replace the top of `handleRazorpayWebhook`:

```javascript
const crypto = require('crypto');
const Cafe = require('../models/Cafe');
const Reservation = require('../models/Reservation');
const { transitionState } = require('../services/stateMachine');
const { decrypt } = require('../utils/encryption');

const handleRazorpayWebhook = async (req, res, next) => {
  try {
    const { cafeSlug } = req.params;
    const cafe = await Cafe.findOne({ slug: cafeSlug, is_deleted: false });
    if (!cafe || !cafe.payments?.configured) {
      return res.status(404).json({ status: 'fail', message: 'Unknown cafe' });
    }

    const signature = req.headers['x-razorpay-signature'];
    const secret = decrypt(cafe.payments.razorpay_webhook_secret_encrypted);

    if (!signature) {
      return res.status(400).json({ status: 'fail', message: 'Missing Razorpay signature' });
    }
```

(Remove the old `const config = require('../config/env');` import and the old `const secret = config.RAZORPAY_WEBHOOK_SECRET;` line — replaced by the per-cafe lookup above. The rest of the function — raw-body check, signature comparison, event handling, idempotency — stays exactly as-is.)

- [ ] **Step 4: Update the route**

In `backend/src/routes/v1/webhookRoutes.js`:

```javascript
const express = require('express');
const router = express.Router();
const { handleRazorpayWebhook } = require('../../controllers/webhookController');

router.post('/razorpay/:cafeSlug', handleRazorpayWebhook);

module.exports = router;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npx jest tests/integration/perCafeWebhook.test.js`
Expected: PASS, 3 tests

- [ ] **Step 6: Update the old webhook tests to the new per-cafe route**

In `backend/tests/integration/webhookSignatureVerification.test.js` and `backend/tests/integration/webhookIdempotency.test.js`:
- Add `payments: { razorpay_key_id: 'rzp_test_fixture', razorpay_key_secret_encrypted: encrypt('fixture_key_secret'), razorpay_webhook_secret_encrypted: encrypt('fixture_webhook_secret'), configured: true }` to each `Cafe.create({...})` call (importing `encrypt` from `../../src/utils/encryption`).
- Change `const secret = config.RAZORPAY_WEBHOOK_SECRET || 'rzp_test_webhook_secret';` to `const secret = 'fixture_webhook_secret';` (matching the fixture above).
- Change every `.post('/api/v1/webhooks/razorpay')` to `.post(\`/api/v1/webhooks/razorpay/${cafe.slug}\`)`.

- [ ] **Step 7: Comment out the now-unused `RAZORPAY_WEBHOOK_SECRET`**

In `backend/src/config/env.js`:

```javascript
const INSECURE_DEFAULTS = {
  // RAZORPAY_KEY_ID: 'rzp_test_key_id',
  // RAZORPAY_KEY_SECRET: 'rzp_test_key_secret',
  // RAZORPAY_WEBHOOK_SECRET removed for the same reason as the two above —
  // webhooks are now verified per-cafe (see Cafe.payments.razorpay_webhook_secret_encrypted).
  // RAZORPAY_WEBHOOK_SECRET: 'rzp_test_webhook_secret',
  ENCRYPTION_KEY: 'insecure_dev_only_encryption_key_32b',
};
```

```javascript
    // RAZORPAY_KEY_ID: z.string().optional().default(INSECURE_DEFAULTS.RAZORPAY_KEY_ID),
    // RAZORPAY_KEY_SECRET: z.string().optional().default(INSECURE_DEFAULTS.RAZORPAY_KEY_SECRET),
    // RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(INSECURE_DEFAULTS.RAZORPAY_WEBHOOK_SECRET),
```

Remove the now-empty `RAZORPAY_WEBHOOK_SECRET` entry from the production `superRefine` loop's `INSECURE_DEFAULTS` iteration by leaving it exactly as-is — it already iterates `Object.entries(INSECURE_DEFAULTS)`, and since all three Razorpay keys are commented out of that object, nothing further changes there.

In `backend/.env` and `backend/.env.example`, comment out the `RAZORPAY_WEBHOOK_SECRET` line the same way.

- [ ] **Step 8: Run the full backend suite**

Run: `cd backend && npm test`
Expected: All passing

- [ ] **Step 9: Commit**

```bash
git add backend/src/controllers/webhookController.js backend/src/routes/v1/webhookRoutes.js backend/tests/integration/perCafeWebhook.test.js backend/tests/integration/webhookSignatureVerification.test.js backend/tests/integration/webhookIdempotency.test.js backend/src/config/env.js backend/.env.example
git commit -m "feat: move Razorpay webhooks to a per-cafe route verified with each cafe's own secret"
```

---

### Task 8: Frontend — `Cafe` type + `PaymentsEditor` component wired into Settings

**Files:**
- Modify: `frontend/src/lib/types/models.d.ts`
- Create: `frontend/src/components/dashboard/payments-editor.tsx`
- Test: `frontend/src/components/dashboard/payments-editor.test.tsx`
- Modify: `frontend/src/app/[tenant]/(dashboard)/settings/page.tsx`

**Interfaces:**
- Produces: `Cafe.payments?: { razorpay_key_id: string; configured: boolean }` on the shared `Cafe` type.
- Produces: `<PaymentsEditor razorpayKeyId={string} configured={boolean} onSaved={(webhook: { url: string; secret: string }) => void} />` — a self-contained form with its own Key ID/Key Secret inputs and its own save button (separate from the rest of the Settings form, since a payments save has its own validation round-trip and its own one-time webhook reveal to show).

- [ ] **Step 1: Add the `payments` field to the `Cafe` type**

In `frontend/src/lib/types/models.d.ts`, add to the `Cafe` interface (after `menu?: CafeMenuCategory[];`):

```typescript
  payments?: {
    razorpay_key_id: string;
    configured: boolean;
  };
```

- [ ] **Step 2: Write the failing component test**

```typescript
// frontend/src/components/dashboard/payments-editor.test.tsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { PaymentsEditor } from './payments-editor';
import { axiosInstance } from '@/hooks/api/axios-instance';

vi.mock('@/hooks/api/axios-instance', () => ({
  axiosInstance: { put: vi.fn() },
}));

describe('PaymentsEditor', () => {
  test('shows a "not configured" empty state with inputs when payments are not yet set up', () => {
    render(<PaymentsEditor cafeId="cafe1" razorpayKeyId="" configured={false} onSaved={vi.fn()} />);

    expect(screen.getByLabelText(/key id/i)).toHaveValue('');
    expect(screen.getByLabelText(/key secret/i)).toHaveValue('');
    expect(screen.getByText(/not.*configured|not yet set up/i)).toBeInTheDocument();
  });

  test('shows the saved Key ID and a "configured" badge when already configured', () => {
    render(<PaymentsEditor cafeId="cafe1" razorpayKeyId="rzp_live_abc123" configured={true} onSaved={vi.fn()} />);

    expect(screen.getByText('rzp_live_abc123')).toBeInTheDocument();
    expect(screen.getByText(/live mode/i)).toBeInTheDocument();
  });

  test('shows a "test mode" badge for a rzp_test_ key id', () => {
    render(<PaymentsEditor cafeId="cafe1" razorpayKeyId="rzp_test_abc123" configured={true} onSaved={vi.fn()} />);

    expect(screen.getByText(/test mode/i)).toBeInTheDocument();
  });

  test('submits Key ID and Key Secret and calls onSaved with the returned webhook details', async () => {
    const onSaved = vi.fn();
    vi.mocked(axiosInstance.put).mockResolvedValue({
      data: {
        data: {
          payments: { razorpay_key_id: 'rzp_test_new', configured: true },
          payments_webhook: { url: 'https://nextbooq.in/api/v1/webhooks/razorpay/vtcafe', secret: 'whsec_abc' },
        },
      },
    });

    render(<PaymentsEditor cafeId="cafe1" razorpayKeyId="" configured={false} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText(/key id/i), { target: { value: 'rzp_test_new' } });
    fireEvent.change(screen.getByLabelText(/key secret/i), { target: { value: 'somesecretvalue' } });
    fireEvent.click(screen.getByRole('button', { name: /save.*payment|connect razorpay/i }));

    await waitFor(() =>
      expect(axiosInstance.put).toHaveBeenCalledWith('/api/v1/cafes/cafe1', {
        payments: { razorpay_key_id: 'rzp_test_new', razorpay_key_secret: 'somesecretvalue' },
      })
    );
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({
        url: 'https://nextbooq.in/api/v1/webhooks/razorpay/vtcafe',
        secret: 'whsec_abc',
      })
    );
  });

  test('shows the backend validation error message when the save is rejected', async () => {
    vi.mocked(axiosInstance.put).mockRejectedValue({
      response: { data: { message: "These Razorpay credentials couldn't be verified." } },
    });

    render(<PaymentsEditor cafeId="cafe1" razorpayKeyId="" configured={false} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/key id/i), { target: { value: 'rzp_test_bad' } });
    fireEvent.change(screen.getByLabelText(/key secret/i), { target: { value: 'wrongsecret' } });
    fireEvent.click(screen.getByRole('button', { name: /save.*payment|connect razorpay/i }));

    await waitFor(() =>
      expect(screen.getByText(/couldn't be verified/i)).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2b: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/payments-editor.test.tsx`
Expected: FAIL — `./payments-editor` doesn't exist yet.

- [ ] **Step 3: Implement `PaymentsEditor`**

```typescript
// frontend/src/components/dashboard/payments-editor.tsx
'use client';

import { useState } from 'react';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { CreditCard, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';

interface WebhookReveal {
  url: string;
  secret: string;
}

interface PaymentsEditorProps {
  cafeId: string;
  razorpayKeyId: string;
  configured: boolean;
  onSaved: (webhook: WebhookReveal) => void;
}

export function PaymentsEditor({ cafeId, razorpayKeyId, configured, onSaved }: PaymentsEditorProps) {
  const [replacing, setReplacing] = useState(!configured);
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modeLabel = razorpayKeyId.startsWith('rzp_live_') ? 'Live mode' : razorpayKeyId.startsWith('rzp_test_') ? 'Test mode' : null;

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      const res = await axiosInstance.put(`/api/v1/cafes/${cafeId}`, {
        payments: { razorpay_key_id: keyId, razorpay_key_secret: keySecret },
      });
      onSaved(res.data.data.payments_webhook);
      setReplacing(false);
      setKeyId('');
      setKeySecret('');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save Razorpay credentials');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="pt-6 border-t border-brand-brown/10 space-y-4">
      <h2 className="text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
        <CreditCard className="w-4 h-4 text-brand-red" /> Payments
      </h2>

      {configured && !replacing ? (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-emerald-800">
            <ShieldCheck className="h-4 w-4" />
            <span className="font-mono">{razorpayKeyId}</span>
            {modeLabel && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold">{modeLabel}</span>}
          </div>
          <button
            type="button"
            onClick={() => setReplacing(true)}
            className="text-xs font-semibold text-brand-red hover:underline"
          >
            Replace credentials
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            Not yet configured — reservations can&apos;t be paid for until this cafe&apos;s own Razorpay account is
            connected.
          </div>

          <div>
            <label htmlFor="razorpay-key-id" className="block text-sm font-semibold text-brand-brown mb-1.5">
              Key ID
            </label>
            <input
              id="razorpay-key-id"
              type="text"
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              placeholder="rzp_live_..."
              className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm font-mono"
            />
          </div>

          <div>
            <label htmlFor="razorpay-key-secret" className="block text-sm font-semibold text-brand-brown mb-1.5">
              Key Secret
            </label>
            <input
              id="razorpay-key-secret"
              type="password"
              value={keySecret}
              onChange={(e) => setKeySecret(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm font-mono"
            />
          </div>

          {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !keyId || !keySecret}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-red px-4 py-2 text-sm font-semibold text-white shadow-brand-sm transition-colors hover:bg-brand-redDark disabled:opacity-50"
          >
            {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {configured ? 'Save new credentials' : 'Connect Razorpay'}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/dashboard/payments-editor.test.tsx`
Expected: PASS, 5 tests

- [ ] **Step 5: Wire `PaymentsEditor` into the Settings page**

In `frontend/src/app/[tenant]/(dashboard)/settings/page.tsx`:

Add the import:

```typescript
import { PaymentsEditor } from '@/components/dashboard/payments-editor';
```

Add state (near the other `useState` declarations):

```typescript
  const [webhookReveal, setWebhookReveal] = useState<{ url: string; secret: string } | null>(null);
```

Add the component right after the `<StorefrontEditor .../>` block, inside the `<form>`:

```tsx
          <PaymentsEditor
            cafeId={cafe.id}
            razorpayKeyId={cafe.payments?.razorpay_key_id || ''}
            configured={cafe.payments?.configured || false}
            onSaved={(webhook) => {
              setWebhookReveal(webhook);
              router.refresh();
              toast.success('Razorpay connected. Copy the webhook details below into your Razorpay dashboard now — they won\'t be shown again.');
            }}
          />

          {webhookReveal && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 space-y-1">
              <p className="font-semibold">Add this webhook in your Razorpay dashboard (Settings → Webhooks):</p>
              <p>
                URL: <span className="font-mono">{webhookReveal.url}</span>
              </p>
              <p>
                Secret: <span className="font-mono">{webhookReveal.secret}</span>
              </p>
            </div>
          )}
```

(`PaymentsEditor` is placed outside the form's own `<button type="submit">` flow since it has its own independent save action — it must render before the closing `</form>` tag but its `handleSave` doesn't participate in the outer form's `onSubmit`, since its button has no `type="submit"`.)

- [ ] **Step 6: Run the frontend test suite for the settings page**

Run: `cd frontend && npx tsc --noEmit && npx vitest run src/app/'[tenant]'/'(dashboard)'/settings`
Expected: Type-check clean; any existing settings page tests still passing (this change is additive, not a behavior change to existing fields).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/types/models.d.ts frontend/src/components/dashboard/payments-editor.tsx frontend/src/components/dashboard/payments-editor.test.tsx frontend/src/app/'[tenant]'/'(dashboard)'/settings/page.tsx
git commit -m "feat: add PaymentsEditor for cafes to connect their own Razorpay account"
```

---

### Task 9: Gate the public booking widget on `payments.configured`

**Files:**
- Modify: `frontend/src/components/booking/booking-card.tsx`
- Modify: `frontend/src/components/booking/booking-card.test.tsx`

**Interfaces:**
- Consumes: `cafe.payments?.configured` (Task 8's type addition), already available via `useTenant()`.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/components/booking/booking-card.test.tsx` (following whatever mocking pattern the existing tests in that file already use for `useTenant`):

```typescript
test('shows a "not available" message instead of the booking form when payments are not configured', () => {
  vi.mocked(useTenant).mockReturnValue({
    cafe: { id: 'cafe1', slug: 'demo', name: 'Demo Cafe', timezone: 'UTC', reservation_rules: {}, payments: { razorpay_key_id: '', configured: false } },
  } as any);

  render(<BookingCard />);

  expect(screen.getByText(/aren't available|not available/i)).toBeInTheDocument();
  expect(screen.queryByText(/guests & date/i)).not.toBeInTheDocument();
});

test('shows the normal booking form when payments are configured', () => {
  vi.mocked(useTenant).mockReturnValue({
    cafe: { id: 'cafe1', slug: 'demo', name: 'Demo Cafe', timezone: 'UTC', reservation_rules: {}, payments: { razorpay_key_id: 'rzp_test_x', configured: true } },
  } as any);

  render(<BookingCard />);

  expect(screen.queryByText(/aren't available|not available/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/booking/booking-card.test.tsx`
Expected: FAIL — `BookingCard` currently always renders the full form regardless of `cafe.payments`.

- [ ] **Step 3: Add the gate**

In `frontend/src/components/booking/booking-card.tsx`, right after `const { cafe } = useTenant();`, add:

```tsx
  if (!cafe.payments?.configured) {
    return (
      <div className="ticket-card mx-auto w-full max-w-md p-8 text-center space-y-2">
        <p className="text-base font-bold text-brand-brown">Online reservations aren&apos;t available yet</p>
        <p className="text-sm text-brand-mocha">Please contact {cafe.name} directly to book a table.</p>
      </div>
    );
  }
```

(Exact placement: after any other early hooks the component calls unconditionally, but before the main JSX return, so hook-call order stays consistent across renders — if `BookingCard` calls any `useState`/`useEffect` before this point, keep this check after all of those, never inside a conditional branch relative to them.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/booking/booking-card.test.tsx`
Expected: PASS (including all pre-existing tests in this file, which implicitly need `payments: { configured: true }` added to whatever cafe fixture they already use — update those fixtures if they don't already include it, otherwise this task's new gate will make every pre-existing test in this file render the blocked message instead of the form)

- [ ] **Step 5: Run the full frontend suite**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: All passing

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/booking/booking-card.tsx frontend/src/components/booking/booking-card.test.tsx
git commit -m "fix: block the booking widget for cafes without payments configured"
```

---

### Task 10: Live verification

Not a code task — run through the real flow end-to-end against the dev servers before considering this feature complete.

- [ ] **Step 1: Run the full backend and frontend suites one more time from a clean checkout state**

Run: `cd backend && npm test` and `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: All green.

- [ ] **Step 2: Start both dev servers and open the storefront for a cafe with no payments configured**

Confirm the booking widget shows the "not available" message (Task 9) instead of the reservation form.

- [ ] **Step 3: As that cafe's owner, go to Settings → Payments and try invalid credentials**

Confirm the save is rejected with the "couldn't be verified" message and nothing is silently marked configured.

- [ ] **Step 4: Save valid Razorpay test-mode credentials (a real `rzp_test_...` key pair from a personal/test Razorpay account, or a mocked-in-dev value if `NODE_ENV=development`'s fallback is being relied on instead)**

Confirm the webhook URL + secret reveal appears once, and that reloading the Settings page afterward shows the saved Key ID with a "Test mode" badge but no webhook reveal (since it's one-time).

- [ ] **Step 5: Reload the storefront and confirm the booking widget now renders normally, and a full hold → checkout → payment → confirm flow works end-to-end using that cafe's own credentials**

Confirm in the browser's network tab that the Razorpay Checkout widget opens with that cafe's `rzp_test_...` key id, not any other cafe's.
