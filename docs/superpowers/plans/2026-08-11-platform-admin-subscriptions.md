# Platform Admin Subscription Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the nextBooq operator a cross-tenant admin dashboard to see every organization/cafe's subscription state, computed revenue, and who needs renewal attention, with manual controls to record a verified payment (setting a plan term) or override a cafe's status directly.

**Architecture:** A rewritten `Subscription` model (currently dead code) becomes the per-cafe billing record of truth, one document per committed term, with the most recent (`is_current: true`) reflecting live state. `Cafe.subscription_status` — the field the existing booking-flow gate (`enforceSubscriptionForWrite`) actually reads — is kept in sync on every write, so booking enforcement is untouched by this feature. A new `is_platform_admin` flag on `User`, checked by a new middleware, gates an entirely separate `/api/v1/platform-admin/*` route namespace. The frontend gets a new top-level (non-tenant) `/admin` route group.

**Tech Stack:** Node.js + Express 5 + Mongoose 9 (backend), Jest + Supertest + mongodb-memory-server (backend tests), Next.js 15 + React 19 + TanStack Query + Zustand (frontend), Vitest + Testing Library (frontend tests).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-11-platform-admin-subscriptions-design.md`.
- No automated billing, no payment gateway integration for subscriptions, no payment ledger. The admin manually confirms payment happened elsewhere and records it.
- `enforceSubscriptionForWrite` (`backend/src/middleware/validateSubscription.js`) must NOT be modified and must keep reading `Cafe.subscription_status` directly — every write path in this feature updates that field as a side effect, never routes around it.
- No change to cafe signup (`backend/src/controllers/admin/cafeController.js`'s `createCafe` keeps hardcoding `subscription_status: 'active'`, untouched).
- Plan pricing defaults: 1-month term = ₹9,000/mo, 6-month = ₹8,000/mo, 12-month = ₹7,000/mo, 18-month = ₹6,000/mo. Each term's total is `price_per_month × term_months`.
- `is_platform_admin` is never settable through any HTTP endpoint — only a one-off backend script.
- The existing `backend/src/controllers/admin/` directory and `/api/v1/cafes/...` routes mean "admin of one cafe" (owner/manager). To avoid confusing that with "nextBooq's own operator," every new file/route in this plan uses `platformAdmin` naming, never bare `admin`, on the backend. (The frontend has no such collision — `/admin` as a top-level, non-tenant route is unambiguous there, per the spec.)
- Backend tests run from `backend/`: `npx jest <path> --runInBand`. Frontend tests run from `frontend/`: `npx vitest run <path>`.
- Follow existing conventions exactly: controllers respond `{ status: 'success', data }` (not `{ success: true, data }` — the `ApiResponse<T>` TS type says `success`, but every real controller and consuming hook actually uses `status`/`data.data`; match runtime reality, not the stale type).

---

### Task 1: Data model — rewrite `Subscription`, add `User.is_platform_admin`

**Files:**
- Modify: `backend/src/models/Subscription.js`
- Modify: `backend/src/models/User.js`
- Test: `backend/tests/integration/subscriptionModel.test.js` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `Subscription` model with fields `org_id, cafe_id, term_months, price_per_month, period_start, current_period_end, status, is_current, created_by, note, created_at, updated_at`. `User` model gains `is_platform_admin: Boolean` (default `false`).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/subscriptionModel.test.js`:

```js
const Organization = require('../../src/models/Organization');
const Cafe = require('../../src/models/Cafe');
const Subscription = require('../../src/models/Subscription');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Subscription model', () => {
  let org, cafe;

  beforeEach(async () => {
    org = await Organization.create({ name: 'Model Test Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Model Test Cafe',
      slug: 'model-test-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });
  });

  test('creates a subscription with the new term/price/current fields', async () => {
    const sub = await Subscription.create({
      org_id: org._id,
      cafe_id: cafe._id,
      term_months: 12,
      price_per_month: 7000,
      current_period_end: new Date('2027-01-01T00:00:00Z'),
    });

    expect(sub.status).toBe('active'); // default
    expect(sub.is_current).toBe(true); // default
    expect(sub.period_start).toBeInstanceOf(Date); // defaults to now
    expect(sub.plan_tier).toBeUndefined(); // dropped field
  });

  test('rejects a term_months value outside the allowed set', async () => {
    await expect(
      Subscription.create({
        org_id: org._id,
        cafe_id: cafe._id,
        term_months: 3,
        price_per_month: 5000,
        current_period_end: new Date('2027-01-01T00:00:00Z'),
      })
    ).rejects.toThrow();
  });

  test('rejects a subscription with no current_period_end', async () => {
    await expect(
      Subscription.create({
        org_id: org._id,
        cafe_id: cafe._id,
        term_months: 1,
        price_per_month: 9000,
      })
    ).rejects.toThrow();
  });
});

describe('User.is_platform_admin', () => {
  test('defaults to false', async () => {
    const user = await User.create({
      name: 'Regular User',
      email: 'regular@test.com',
      phone: '+1555990001',
      password_hash: 'pass',
    });
    expect(user.is_platform_admin).toBe(false);
  });

  test('can be set to true', async () => {
    const user = await User.create({
      name: 'Admin User',
      email: 'admin@test.com',
      phone: '+1555990002',
      password_hash: 'pass',
      is_platform_admin: true,
    });
    expect(user.is_platform_admin).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `backend/`:

```bash
npx jest tests/integration/subscriptionModel.test.js --runInBand
```

Expected: FAIL — `sub.plan_tier` is currently defined (not undefined, since the old schema has it defaulting to `'standard'`), `term_months`/`current_period_end` aren't yet enforced, and `is_platform_admin` doesn't exist on `User`.

- [ ] **Step 3: Rewrite `Subscription.js`**

Replace the entire contents of `backend/src/models/Subscription.js`:

```js
const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    org_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    cafe_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cafe',
      required: true,
      index: true,
    },
    term_months: {
      type: Number,
      enum: [1, 6, 12, 18],
      required: true,
    },
    price_per_month: {
      type: Number,
      required: true,
      min: 0,
    },
    period_start: {
      type: Date,
      required: true,
      default: Date.now,
    },
    current_period_end: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['trial', 'active', 'past_due', 'inactive'],
      default: 'active',
    },
    // True for the one Subscription document per cafe that reflects its
    // live state; false for superseded history. A renewal never mutates an
    // old document — it flips this to false and inserts a new one, so past
    // terms survive as an audit trail.
    is_current: {
      type: Boolean,
      default: true,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    note: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Fast "what's this cafe's live state" lookup, used on every list/overview render.
subscriptionSchema.index({ cafe_id: 1, is_current: 1 });
// History, ordered newest-first.
subscriptionSchema.index({ cafe_id: 1, period_start: -1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
```

- [ ] **Step 4: Add `is_platform_admin` to `User.js`**

In `backend/src/models/User.js`, add the field to `userSchema` (after `staff_memberships`):

```js
    staff_memberships: [staffMembershipSchema],
    // Cross-tenant nextBooq operator access, entirely separate from
    // per-cafe staff_memberships roles. Never settable through any HTTP
    // endpoint — only a one-off script (scripts/grantPlatformAdmin.js).
    is_platform_admin: {
      type: Boolean,
      default: false,
    },
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx jest tests/integration/subscriptionModel.test.js --runInBand
```

Expected: PASS (5 tests).

- [ ] **Step 6: Run the full backend suite to confirm no regression**

```bash
npx jest --runInBand
```

Expected: PASS, all suites. (If `tests/integration/concurrencyBooking.test.js` fails with an assertion like "Expected: 49 / Received: N" under full-suite load, re-run it alone — `npx jest tests/integration/concurrencyBooking.test.js --runInBand` — that suite is known-flaky under load and passes in isolation; treat that as green.)

- [ ] **Step 7: Commit**

```bash
git add backend/src/models/Subscription.js backend/src/models/User.js backend/tests/integration/subscriptionModel.test.js
git commit -m "feat: rewrite Subscription model for term-based billing, add User.is_platform_admin"
```

---

### Task 2: `requirePlatformAdmin` middleware

**Files:**
- Create: `backend/src/middleware/requirePlatformAdmin.js`
- Test: `backend/tests/integration/requirePlatformAdmin.test.js` (create)

**Interfaces:**
- Consumes: `User.is_platform_admin` (Task 1).
- Produces: `requirePlatformAdmin(req, res, next)` — Express middleware. Calls `next(new ForbiddenError(...))` (403) when `req.user.is_platform_admin` is falsy; otherwise calls `next()`. Assumes `req.user` is already populated by the existing `authenticate` middleware (`backend/src/middleware/auth.js`) — must run after it.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/requirePlatformAdmin.test.js`. This builds a tiny throwaway Express app (there's no real route to hit yet — that's Task 5) to test the middleware in isolation, the same way you'd unit-test any Express middleware:

```js
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../../src/config/env');
const { authenticate } = require('../../src/middleware/auth');
const { requirePlatformAdmin } = require('../../src/middleware/requirePlatformAdmin');
const errorHandler = require('../../src/middleware/errorHandler');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');

setupTestDB();

const buildTestApp = () => {
  const app = express();
  app.get('/protected', authenticate, requirePlatformAdmin, (req, res) => {
    res.status(200).json({ status: 'success', data: 'ok' });
  });
  app.use(errorHandler);
  return app;
};

describe('requirePlatformAdmin middleware', () => {
  test('rejects a non-admin authenticated user with 403', async () => {
    const user = await User.create({
      name: 'Regular',
      email: 'regular-mw@test.com',
      phone: '+1555991001',
      password_hash: 'pass',
    });
    const token = jwt.sign({ id: user._id.toString() }, config.JWT_SECRET);

    const res = await request(buildTestApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test('allows a platform admin through to the route', async () => {
    const admin = await User.create({
      name: 'Admin',
      email: 'admin-mw@test.com',
      phone: '+1555991002',
      password_hash: 'pass',
      is_platform_admin: true,
    });
    const token = jwt.sign({ id: admin._id.toString() }, config.JWT_SECRET);

    const res = await request(buildTestApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBe('ok');
  });

  test('rejects an unauthenticated request with 401 before even reaching the admin check', async () => {
    const res = await request(buildTestApp()).get('/protected');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest tests/integration/requirePlatformAdmin.test.js --runInBand
```

Expected: FAIL — `Cannot find module '../../src/middleware/requirePlatformAdmin'`.

- [ ] **Step 3: Implement the middleware**

Create `backend/src/middleware/requirePlatformAdmin.js`:

```js
const { ForbiddenError } = require('../utils/errors');

/**
 * Gates the /api/v1/platform-admin/* namespace. Must run after `authenticate`
 * — it only checks a flag on req.user, it does not verify identity itself.
 */
const requirePlatformAdmin = (req, res, next) => {
  if (!req.user?.is_platform_admin) {
    return next(new ForbiddenError('Platform admin access required'));
  }
  next();
};

module.exports = {
  requirePlatformAdmin,
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest tests/integration/requirePlatformAdmin.test.js --runInBand
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/requirePlatformAdmin.js backend/tests/integration/requirePlatformAdmin.test.js
git commit -m "feat: add requirePlatformAdmin middleware"
```

---

### Task 3: `subscriptionAdminService` — read and write subscription state

**Files:**
- Create: `backend/src/services/subscriptionAdminService.js`
- Test: `backend/tests/integration/subscriptionAdminService.test.js` (create)

**Interfaces:**
- Consumes: `Subscription`, `Organization`, `Cafe` models (Task 1 for `Subscription`'s new shape).
- Produces, all exported from `subscriptionAdminService.js`:
  - `getOverviewStats()` → `Promise<{ org_count: number, cafe_count: number, status_counts: { trial: number, active: number, past_due: number, inactive: number }, pending_count: number, revenue: number }>`
  - `listOrgsWithCafes()` → `Promise<Array<Organization & { cafes: Array<Cafe & { subscription: Subscription | null }> }>>` (plain objects, `.lean()`)
  - `getCafeSubscriptionHistory(cafeId)` → `Promise<Subscription[]>`, newest `period_start` first
  - `recordSubscriptionTerm({ cafeId, orgId, termMonths, pricePerMonth, adminUserId, note })` → `Promise<Subscription>` — the new current record
  - `setSubscriptionStatus({ cafeId, status, adminUserId, note })` → `Promise<Subscription>` — throws `NotFoundError` if the cafe has no `is_current` subscription yet

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/integration/subscriptionAdminService.test.js`:

```js
const Organization = require('../../src/models/Organization');
const Cafe = require('../../src/models/Cafe');
const Subscription = require('../../src/models/Subscription');
const User = require('../../src/models/User');
const {
  getOverviewStats,
  listOrgsWithCafes,
  getCafeSubscriptionHistory,
  recordSubscriptionTerm,
  setSubscriptionStatus,
} = require('../../src/services/subscriptionAdminService');
const { setupTestDB } = require('../setup');

setupTestDB();

const makeOrgCafe = async (orgName, cafeName, slug) => {
  const org = await Organization.create({ name: orgName });
  const cafe = await Cafe.create({
    org_id: org._id,
    name: cafeName,
    slug,
    timezone: 'UTC',
    subscription_status: 'active',
  });
  return { org, cafe };
};

describe('recordSubscriptionTerm', () => {
  test('creates a current subscription and computes current_period_end from term_months', async () => {
    const { org, cafe } = await makeOrgCafe('Record Org', 'Record Cafe', 'record-cafe');
    const admin = await User.create({
      name: 'Admin',
      email: 'admin-record@test.com',
      phone: '+1555992001',
      password_hash: 'pass',
      is_platform_admin: true,
    });

    const before = Date.now();
    const sub = await recordSubscriptionTerm({
      cafeId: cafe._id,
      orgId: org._id,
      termMonths: 12,
      pricePerMonth: 7000,
      adminUserId: admin._id,
      note: 'Paid via UPI',
    });

    expect(sub.is_current).toBe(true);
    expect(sub.status).toBe('active');
    expect(sub.term_months).toBe(12);
    expect(sub.price_per_month).toBe(7000);
    expect(sub.note).toBe('Paid via UPI');

    // current_period_end should be ~12 months after period_start, not client-supplied.
    const monthsElapsed =
      (sub.current_period_end.getFullYear() - sub.period_start.getFullYear()) * 12 +
      (sub.current_period_end.getMonth() - sub.period_start.getMonth());
    expect(monthsElapsed).toBe(12);
    expect(sub.period_start.getTime()).toBeGreaterThanOrEqual(before);

    const updatedCafe = await Cafe.findById(cafe._id);
    expect(updatedCafe.subscription_status).toBe('active');
  });

  test('a second call supersedes the first: old record becomes non-current, new one is current', async () => {
    const { org, cafe } = await makeOrgCafe('Renew Org', 'Renew Cafe', 'renew-cafe');
    const admin = await User.create({
      name: 'Admin',
      email: 'admin-renew@test.com',
      phone: '+1555992002',
      password_hash: 'pass',
      is_platform_admin: true,
    });

    const first = await recordSubscriptionTerm({
      cafeId: cafe._id,
      orgId: org._id,
      termMonths: 1,
      pricePerMonth: 9000,
      adminUserId: admin._id,
    });

    const second = await recordSubscriptionTerm({
      cafeId: cafe._id,
      orgId: org._id,
      termMonths: 12,
      pricePerMonth: 7000,
      adminUserId: admin._id,
    });

    const reloadedFirst = await Subscription.findById(first._id);
    expect(reloadedFirst.is_current).toBe(false);

    const reloadedSecond = await Subscription.findById(second._id);
    expect(reloadedSecond.is_current).toBe(true);

    const currentCount = await Subscription.countDocuments({ cafe_id: cafe._id, is_current: true });
    expect(currentCount).toBe(1);
  });
});

describe('setSubscriptionStatus', () => {
  test('updates only the status field, leaving term/price/period_end untouched', async () => {
    const { org, cafe } = await makeOrgCafe('Status Org', 'Status Cafe', 'status-cafe');
    const admin = await User.create({
      name: 'Admin',
      email: 'admin-status@test.com',
      phone: '+1555992003',
      password_hash: 'pass',
      is_platform_admin: true,
    });

    const original = await recordSubscriptionTerm({
      cafeId: cafe._id,
      orgId: org._id,
      termMonths: 6,
      pricePerMonth: 8000,
      adminUserId: admin._id,
    });

    const updated = await setSubscriptionStatus({
      cafeId: cafe._id,
      status: 'inactive',
      adminUserId: admin._id,
      note: 'Non-payment',
    });

    expect(updated._id.toString()).toBe(original._id.toString());
    expect(updated.status).toBe('inactive');
    expect(updated.term_months).toBe(6);
    expect(updated.price_per_month).toBe(8000);
    expect(updated.current_period_end.getTime()).toBe(original.current_period_end.getTime());

    const updatedCafe = await Cafe.findById(cafe._id);
    expect(updatedCafe.subscription_status).toBe('inactive');
  });

  test('throws NotFoundError for a cafe with no subscription on record yet', async () => {
    const { cafe } = await makeOrgCafe('Unconfigured Org', 'Unconfigured Cafe', 'unconfigured-cafe');
    const admin = await User.create({
      name: 'Admin',
      email: 'admin-unconf@test.com',
      phone: '+1555992004',
      password_hash: 'pass',
      is_platform_admin: true,
    });

    await expect(
      setSubscriptionStatus({ cafeId: cafe._id, status: 'trial', adminUserId: admin._id })
    ).rejects.toThrow('no subscription on record');
  });
});

describe('getCafeSubscriptionHistory', () => {
  test('returns all terms for a cafe, newest period_start first', async () => {
    const { org, cafe } = await makeOrgCafe('History Org', 'History Cafe', 'history-cafe');
    const admin = await User.create({
      name: 'Admin',
      email: 'admin-history@test.com',
      phone: '+1555992005',
      password_hash: 'pass',
      is_platform_admin: true,
    });

    await recordSubscriptionTerm({ cafeId: cafe._id, orgId: org._id, termMonths: 1, pricePerMonth: 9000, adminUserId: admin._id });
    await new Promise((r) => setTimeout(r, 5));
    await recordSubscriptionTerm({ cafeId: cafe._id, orgId: org._id, termMonths: 12, pricePerMonth: 7000, adminUserId: admin._id });

    const history = await getCafeSubscriptionHistory(cafe._id);

    expect(history).toHaveLength(2);
    expect(history[0].term_months).toBe(12); // most recent first
    expect(history[1].term_months).toBe(1);
  });
});

describe('listOrgsWithCafes', () => {
  test('includes a cafe with no subscription as subscription: null', async () => {
    const { org, cafe } = await makeOrgCafe('List Org', 'List Cafe', 'list-cafe');

    const orgs = await listOrgsWithCafes();

    const found = orgs.find((o) => o._id.toString() === org._id.toString());
    expect(found).toBeDefined();
    const foundCafe = found.cafes.find((c) => c._id.toString() === cafe._id.toString());
    expect(foundCafe.subscription).toBeNull();
  });

  test('includes a cafe with a current subscription attached', async () => {
    const { org, cafe } = await makeOrgCafe('List Org 2', 'List Cafe 2', 'list-cafe-2');
    const admin = await User.create({
      name: 'Admin',
      email: 'admin-list@test.com',
      phone: '+1555992006',
      password_hash: 'pass',
      is_platform_admin: true,
    });
    await recordSubscriptionTerm({ cafeId: cafe._id, orgId: org._id, termMonths: 18, pricePerMonth: 6000, adminUserId: admin._id });

    const orgs = await listOrgsWithCafes();

    const found = orgs.find((o) => o._id.toString() === org._id.toString());
    const foundCafe = found.cafes.find((c) => c._id.toString() === cafe._id.toString());
    expect(foundCafe.subscription).not.toBeNull();
    expect(foundCafe.subscription.term_months).toBe(18);
  });
});

describe('getOverviewStats', () => {
  test('computes counts and revenue matching a hand-computed sum over a mixed fixture', async () => {
    const admin = await User.create({
      name: 'Admin',
      email: 'admin-overview@test.com',
      phone: '+1555992007',
      password_hash: 'pass',
      is_platform_admin: true,
    });

    const { org: orgA, cafe: cafeA } = await makeOrgCafe('Overview Org A', 'Overview Cafe A', 'overview-cafe-a');
    const { org: orgB, cafe: cafeB } = await makeOrgCafe('Overview Org B', 'Overview Cafe B', 'overview-cafe-b');
    const { cafe: cafeC } = await makeOrgCafe('Overview Org C', 'Overview Cafe C', 'overview-cafe-c');

    // Active, 12mo @ 7000/mo -> 84000 total, counts toward revenue.
    await recordSubscriptionTerm({ cafeId: cafeA._id, orgId: orgA._id, termMonths: 12, pricePerMonth: 7000, adminUserId: admin._id });
    // Active, 1mo @ 9000/mo -> 9000 total, counts toward revenue.
    await recordSubscriptionTerm({ cafeId: cafeB._id, orgId: orgB._id, termMonths: 1, pricePerMonth: 9000, adminUserId: admin._id });
    // cafeC: no subscription at all (unconfigured) -> doesn't count toward any status bucket or revenue.

    const stats = await getOverviewStats();

    expect(stats.cafe_count).toBeGreaterThanOrEqual(3);
    expect(stats.status_counts.active).toBeGreaterThanOrEqual(2);
    expect(stats.revenue).toBeGreaterThanOrEqual(84000 + 9000);
  });

  test('a subscription whose current_period_end is within 7 days counts as pending', async () => {
    const admin = await User.create({
      name: 'Admin',
      email: 'admin-pending@test.com',
      phone: '+1555992008',
      password_hash: 'pass',
      is_platform_admin: true,
    });
    const { org, cafe } = await makeOrgCafe('Pending Org', 'Pending Cafe', 'pending-cafe');

    await Subscription.create({
      org_id: org._id,
      cafe_id: cafe._id,
      term_months: 1,
      price_per_month: 9000,
      period_start: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
      current_period_end: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
      status: 'active',
      is_current: true,
    });

    const before = await getOverviewStats();
    expect(before.pending_count).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest tests/integration/subscriptionAdminService.test.js --runInBand
```

Expected: FAIL — `Cannot find module '../../src/services/subscriptionAdminService'`.

- [ ] **Step 3: Implement the service**

Create `backend/src/services/subscriptionAdminService.js`:

```js
const Organization = require('../models/Organization');
const Cafe = require('../models/Cafe');
const Subscription = require('../models/Subscription');
const { NotFoundError } = require('../utils/errors');

const PENDING_WINDOW_DAYS = 7;

// JS Date month-arithmetic note: setMonth() on the 29th-31st of a month can
// roll into the following month if the target month is shorter (e.g. Jan 31
// + 1 month -> Mar 3, skipping Feb). Acceptable here: this is an
// admin-recorded, non-time-critical billing date, not a scheduling primitive.
const computeCurrentPeriodEnd = (periodStart, termMonths) => {
  const end = new Date(periodStart);
  end.setMonth(end.getMonth() + termMonths);
  return end;
};

const syncCafeStatus = async (cafeId, status) => {
  await Cafe.updateOne({ _id: cafeId }, { $set: { subscription_status: status } });
};

const getOverviewStats = async () => {
  const [orgCount, cafeCount, currentSubs] = await Promise.all([
    Organization.countDocuments({}),
    Cafe.countDocuments({ is_deleted: false }),
    Subscription.find({ is_current: true }),
  ]);

  const statusCounts = { trial: 0, active: 0, past_due: 0, inactive: 0 };
  let revenue = 0;
  let pendingCount = 0;
  const pendingThreshold = new Date(Date.now() + PENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  for (const sub of currentSubs) {
    statusCounts[sub.status] = (statusCounts[sub.status] || 0) + 1;
    if (sub.status === 'active') {
      revenue += sub.price_per_month * sub.term_months;
    }
    if (sub.current_period_end <= pendingThreshold) {
      pendingCount += 1;
    }
  }

  return {
    org_count: orgCount,
    cafe_count: cafeCount,
    status_counts: statusCounts,
    pending_count: pendingCount,
    revenue,
  };
};

const listOrgsWithCafes = async () => {
  const [orgs, cafes, currentSubs] = await Promise.all([
    Organization.find({}).sort({ name: 1 }).lean(),
    Cafe.find({ is_deleted: false }).sort({ name: 1 }).lean(),
    Subscription.find({ is_current: true }).lean(),
  ]);

  const subByCafeId = new Map(currentSubs.map((sub) => [sub.cafe_id.toString(), sub]));

  const cafesByOrgId = new Map();
  for (const cafe of cafes) {
    const orgIdStr = cafe.org_id.toString();
    if (!cafesByOrgId.has(orgIdStr)) cafesByOrgId.set(orgIdStr, []);
    cafesByOrgId.get(orgIdStr).push({
      ...cafe,
      subscription: subByCafeId.get(cafe._id.toString()) || null,
    });
  }

  return orgs.map((org) => ({
    ...org,
    cafes: cafesByOrgId.get(org._id.toString()) || [],
  }));
};

const getCafeSubscriptionHistory = async (cafeId) => {
  return Subscription.find({ cafe_id: cafeId }).sort({ period_start: -1 });
};

const recordSubscriptionTerm = async ({ cafeId, orgId, termMonths, pricePerMonth, adminUserId, note }) => {
  const periodStart = new Date();
  const currentPeriodEnd = computeCurrentPeriodEnd(periodStart, termMonths);

  await Subscription.updateMany(
    { cafe_id: cafeId, is_current: true },
    { $set: { is_current: false } }
  );

  const subscription = await Subscription.create({
    org_id: orgId,
    cafe_id: cafeId,
    term_months: termMonths,
    price_per_month: pricePerMonth,
    period_start: periodStart,
    current_period_end: currentPeriodEnd,
    status: 'active',
    is_current: true,
    created_by: adminUserId,
    note: note || '',
  });

  await syncCafeStatus(cafeId, 'active');

  return subscription;
};

const setSubscriptionStatus = async ({ cafeId, status, adminUserId, note }) => {
  const current = await Subscription.findOne({ cafe_id: cafeId, is_current: true });
  if (!current) {
    throw new NotFoundError(
      'This cafe has no subscription on record yet — record a plan term first'
    );
  }

  current.status = status;
  if (note !== undefined) current.note = note;
  await current.save();

  await syncCafeStatus(cafeId, status);

  return current;
};

module.exports = {
  getOverviewStats,
  listOrgsWithCafes,
  getCafeSubscriptionHistory,
  recordSubscriptionTerm,
  setSubscriptionStatus,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest tests/integration/subscriptionAdminService.test.js --runInBand
```

Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/subscriptionAdminService.js backend/tests/integration/subscriptionAdminService.test.js
git commit -m "feat: add subscriptionAdminService for reading and recording cafe subscriptions"
```

---

### Task 4: `subscriptionExpiryService` — the auto-flip-to-past_due sweep

**Files:**
- Create: `backend/src/services/subscriptionExpiryService.js`
- Modify: `backend/server.js`
- Test: `backend/tests/integration/subscriptionExpiry.test.js` (create)

**Interfaces:**
- Consumes: `Subscription`, `Cafe` models.
- Produces: `expireLapsedSubscriptions()` → `Promise<{ expiredCount: number }>`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/subscriptionExpiry.test.js`:

```js
const Organization = require('../../src/models/Organization');
const Cafe = require('../../src/models/Cafe');
const Subscription = require('../../src/models/Subscription');
const { expireLapsedSubscriptions } = require('../../src/services/subscriptionExpiryService');
const { setupTestDB } = require('../setup');

setupTestDB();

const makeOrgCafe = async (slug) => {
  const org = await Organization.create({ name: `Expiry Org ${slug}` });
  const cafe = await Cafe.create({
    org_id: org._id,
    name: `Expiry Cafe ${slug}`,
    slug,
    timezone: 'UTC',
    subscription_status: 'active',
  });
  return { org, cafe };
};

describe('expireLapsedSubscriptions', () => {
  test('flips a lapsed active, is_current subscription to past_due and syncs Cafe.subscription_status', async () => {
    const { org, cafe } = await makeOrgCafe('expiry-lapsed');
    const sub = await Subscription.create({
      org_id: org._id,
      cafe_id: cafe._id,
      term_months: 1,
      price_per_month: 9000,
      period_start: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      current_period_end: new Date(Date.now() - 60 * 1000), // already passed
      status: 'active',
      is_current: true,
    });

    const result = await expireLapsedSubscriptions();

    expect(result.expiredCount).toBe(1);
    const updated = await Subscription.findById(sub._id);
    expect(updated.status).toBe('past_due');
    const updatedCafe = await Cafe.findById(cafe._id);
    expect(updatedCafe.subscription_status).toBe('past_due');
  });

  test('leaves an active subscription with a future current_period_end untouched', async () => {
    const { org, cafe } = await makeOrgCafe('expiry-future');
    const sub = await Subscription.create({
      org_id: org._id,
      cafe_id: cafe._id,
      term_months: 1,
      price_per_month: 9000,
      current_period_end: new Date(Date.now() + 60 * 1000),
      status: 'active',
      is_current: true,
    });

    await expireLapsedSubscriptions();

    const updated = await Subscription.findById(sub._id);
    expect(updated.status).toBe('active');
  });

  test('ignores a lapsed subscription that is not is_current (already superseded)', async () => {
    const { org, cafe } = await makeOrgCafe('expiry-superseded');
    const sub = await Subscription.create({
      org_id: org._id,
      cafe_id: cafe._id,
      term_months: 1,
      price_per_month: 9000,
      current_period_end: new Date(Date.now() - 60 * 1000),
      status: 'active',
      is_current: false,
    });

    const result = await expireLapsedSubscriptions();

    expect(result.expiredCount).toBe(0);
    const updated = await Subscription.findById(sub._id);
    expect(updated.status).toBe('active');
  });

  test('ignores a lapsed subscription that is already inactive (manually disabled, not a billing lapse)', async () => {
    const { org, cafe } = await makeOrgCafe('expiry-inactive');
    const sub = await Subscription.create({
      org_id: org._id,
      cafe_id: cafe._id,
      term_months: 1,
      price_per_month: 9000,
      current_period_end: new Date(Date.now() - 60 * 1000),
      status: 'inactive',
      is_current: true,
    });

    const result = await expireLapsedSubscriptions();

    expect(result.expiredCount).toBe(0);
    const updated = await Subscription.findById(sub._id);
    expect(updated.status).toBe('inactive');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest tests/integration/subscriptionExpiry.test.js --runInBand
```

Expected: FAIL — `Cannot find module '../../src/services/subscriptionExpiryService'`.

- [ ] **Step 3: Implement the service**

Create `backend/src/services/subscriptionExpiryService.js`:

```js
const Subscription = require('../models/Subscription');
const Cafe = require('../models/Cafe');

/**
 * Flips is_current, active Subscriptions whose current_period_end has
 * passed to past_due, syncing Cafe.subscription_status. Purely a clock
 * check — no payment verification happens here. The platform admin records
 * a renewal (subscriptionAdminService.recordSubscriptionTerm) once payment
 * is confirmed, which supersedes the lapsed record and clears past_due.
 * Only status: 'active' is eligible — a subscription the admin has already
 * set to 'inactive' (a deliberate disable, not a billing lapse) or 'trial'
 * is left alone; this sweep should never override an explicit admin choice.
 */
const expireLapsedSubscriptions = async () => {
  const lapsed = await Subscription.find({
    is_current: true,
    status: 'active',
    current_period_end: { $lte: new Date() },
  });

  let expiredCount = 0;
  for (const subscription of lapsed) {
    subscription.status = 'past_due';
    await subscription.save();
    await Cafe.updateOne(
      { _id: subscription.cafe_id },
      { $set: { subscription_status: 'past_due' } }
    );
    expiredCount += 1;
  }

  return { expiredCount };
};

module.exports = {
  expireLapsedSubscriptions,
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest tests/integration/subscriptionExpiry.test.js --runInBand
```

Expected: PASS (4 tests).

- [ ] **Step 5: Wire the sweep into `server.js`**

In `backend/server.js`, add the import (below the existing `reservationExpiryService` require):

```js
const { expireLapsedSubscriptions } = require('./src/services/subscriptionExpiryService');
```

Add a second interval constant (below `RESERVATION_EXPIRY_SWEEP_INTERVAL_MS`) and a second `setInterval`, since subscription lapses don't need minute-level granularity:

```js
const SUBSCRIPTION_EXPIRY_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly
```

Inside `startServer`, after the existing `sweepInterval` declaration, add:

```js
  const subscriptionSweepInterval = setInterval(() => {
    expireLapsedSubscriptions().catch((error) => {
      console.error('[SUBSCRIPTION EXPIRY SWEEP FAILED]', error);
    });
  }, SUBSCRIPTION_EXPIRY_SWEEP_INTERVAL_MS);
```

And add its cleanup inside `handleShutdown`, alongside the existing `clearInterval(sweepInterval);`:

```js
    clearInterval(subscriptionSweepInterval);
```

- [ ] **Step 6: Manually verify `server.js` still starts cleanly**

Run from `backend/`:

```bash
node -e "require('./server.js')" &
sleep 2
curl -s http://localhost:5000/health
kill %1
```

Expected: the `curl` prints a JSON body with `"status":"ok"` — confirms `server.js` has no syntax errors and starts normally. (This file isn't covered by the Jest suite, which uses `app.js` directly — this manual check is the only verification available for it.)

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/subscriptionExpiryService.js backend/server.js backend/tests/integration/subscriptionExpiry.test.js
git commit -m "feat: add subscription expiry sweep, flip lapsed subscriptions to past_due"
```

---

### Task 5: Controller + routes — wire the service into HTTP

**Files:**
- Create: `backend/src/controllers/platformAdmin/platformAdminController.js`
- Create: `backend/src/routes/v1/platformAdminRoutes.js`
- Modify: `backend/src/routes/index.js`
- Modify: `backend/src/controllers/authController.js`
- Test: `backend/tests/integration/platformAdminRoutes.test.js` (create)

**Interfaces:**
- Consumes: `subscriptionAdminService`'s five functions (Task 3), `requirePlatformAdmin` (Task 2), `authenticate` (existing).
- Produces: `GET /api/v1/platform-admin/overview`, `GET /api/v1/platform-admin/orgs`, `GET /api/v1/platform-admin/cafes/:cafeId/subscriptions`, `POST /api/v1/platform-admin/cafes/:cafeId/subscriptions`, `PATCH /api/v1/platform-admin/cafes/:cafeId/subscriptions/status`. `GET /api/v1/auth/me`'s response gains `is_platform_admin` — Task 7 (frontend) depends on this exact field name being present in that response.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/integration/platformAdminRoutes.test.js`:

```js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Organization = require('../../src/models/Organization');
const Cafe = require('../../src/models/Cafe');
const User = require('../../src/models/User');
const Subscription = require('../../src/models/Subscription');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Platform admin routes', () => {
  let adminToken, cafeStaffToken, org, cafe;

  beforeEach(async () => {
    org = await Organization.create({ name: 'Route Test Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Route Test Cafe',
      slug: 'route-test-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });

    const admin = await User.create({
      name: 'Platform Admin',
      email: 'platform-admin@test.com',
      phone: '+1555993001',
      password_hash: 'pass',
      is_platform_admin: true,
    });
    adminToken = jwt.sign({ id: admin._id.toString() }, config.JWT_SECRET);

    const cafeStaff = await User.create({
      name: 'Cafe Owner',
      email: 'cafe-owner-route@test.com',
      phone: '+1555993002',
      password_hash: 'pass',
      staff_memberships: [{ cafe_id: cafe._id, role: 'owner', permissions: [] }],
    });
    cafeStaffToken = jwt.sign({ id: cafeStaff._id.toString() }, config.JWT_SECRET);
  });

  test('a cafe-staff (non-platform-admin) user gets 403 on every platform-admin route', async () => {
    const overview = await request(app)
      .get('/api/v1/platform-admin/overview')
      .set('Authorization', `Bearer ${cafeStaffToken}`);
    expect(overview.status).toBe(403);

    const orgs = await request(app)
      .get('/api/v1/platform-admin/orgs')
      .set('Authorization', `Bearer ${cafeStaffToken}`);
    expect(orgs.status).toBe(403);
  });

  test('an unauthenticated request gets 401', async () => {
    const res = await request(app).get('/api/v1/platform-admin/overview');
    expect(res.status).toBe(401);
  });

  test('GET /overview returns computed stats for a platform admin', async () => {
    const res = await request(app)
      .get('/api/v1/platform-admin/overview')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('org_count');
    expect(res.body.data).toHaveProperty('revenue');
  });

  test('GET /orgs lists every org with its cafes', async () => {
    const res = await request(app)
      .get('/api/v1/platform-admin/orgs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const found = res.body.data.find((o) => o._id === org._id.toString());
    expect(found).toBeDefined();
    expect(found.cafes[0].subscription).toBeNull();
  });

  test('POST /cafes/:cafeId/subscriptions records a term and returns it', async () => {
    const res = await request(app)
      .post(`/api/v1/platform-admin/cafes/${cafe._id}/subscriptions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ org_id: org._id.toString(), term_months: 12, price_per_month: 7000, note: 'Paid via UPI' });

    expect(res.status).toBe(201);
    expect(res.body.data.term_months).toBe(12);
    expect(res.body.data.is_current).toBe(true);
  });

  test('POST /cafes/:cafeId/subscriptions rejects an invalid term_months', async () => {
    const res = await request(app)
      .post(`/api/v1/platform-admin/cafes/${cafe._id}/subscriptions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ org_id: org._id.toString(), term_months: 3, price_per_month: 7000 });

    expect(res.status).toBe(400);
  });

  test('GET /cafes/:cafeId/subscriptions returns history newest-first', async () => {
    await Subscription.create({
      org_id: org._id,
      cafe_id: cafe._id,
      term_months: 1,
      price_per_month: 9000,
      period_start: new Date('2026-01-01T00:00:00Z'),
      current_period_end: new Date('2026-02-01T00:00:00Z'),
      status: 'inactive',
      is_current: false,
    });
    await Subscription.create({
      org_id: org._id,
      cafe_id: cafe._id,
      term_months: 12,
      price_per_month: 7000,
      period_start: new Date('2026-03-01T00:00:00Z'),
      current_period_end: new Date('2027-03-01T00:00:00Z'),
      status: 'active',
      is_current: true,
    });

    const res = await request(app)
      .get(`/api/v1/platform-admin/cafes/${cafe._id}/subscriptions`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].term_months).toBe(12);
  });

  test('PATCH /cafes/:cafeId/subscriptions/status updates status for a configured cafe', async () => {
    await request(app)
      .post(`/api/v1/platform-admin/cafes/${cafe._id}/subscriptions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ org_id: org._id.toString(), term_months: 1, price_per_month: 9000 });

    const res = await request(app)
      .patch(`/api/v1/platform-admin/cafes/${cafe._id}/subscriptions/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'inactive' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('inactive');
  });

  test('PATCH /cafes/:cafeId/subscriptions/status 404s for an unconfigured cafe', async () => {
    const res = await request(app)
      .patch(`/api/v1/platform-admin/cafes/${cafe._id}/subscriptions/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'inactive' });

    expect(res.status).toBe(404);
  });

  test('PATCH /cafes/:cafeId/subscriptions/status rejects an invalid status value', async () => {
    const res = await request(app)
      .patch(`/api/v1/platform-admin/cafes/${cafe._id}/subscriptions/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/auth/me includes is_platform_admin', () => {
  test('true for a platform admin', async () => {
    const admin = await User.create({
      name: 'Me Admin',
      email: 'me-admin@test.com',
      phone: '+1555993003',
      password_hash: 'pass',
      is_platform_admin: true,
    });
    const token = jwt.sign({ id: admin._id.toString() }, config.JWT_SECRET);

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.is_platform_admin).toBe(true);
  });

  test('false for a regular user', async () => {
    const user = await User.create({
      name: 'Me Regular',
      email: 'me-regular@test.com',
      phone: '+1555993004',
      password_hash: 'pass',
    });
    const token = jwt.sign({ id: user._id.toString() }, config.JWT_SECRET);

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.is_platform_admin).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest tests/integration/platformAdminRoutes.test.js --runInBand
```

Expected: FAIL — the routes don't exist (404s instead of the expected statuses), and the `is_platform_admin` assertions fail against `getMe`'s current response.

- [ ] **Step 3: Implement the controller**

Create `backend/src/controllers/platformAdmin/platformAdminController.js`:

```js
const {
  getOverviewStats,
  listOrgsWithCafes,
  getCafeSubscriptionHistory,
  recordSubscriptionTerm,
  setSubscriptionStatus,
} = require('../../services/subscriptionAdminService');
const { BadRequestError } = require('../../utils/errors');

const VALID_TERM_MONTHS = [1, 6, 12, 18];
const VALID_STATUSES = ['trial', 'active', 'past_due', 'inactive'];

const getOverview = async (req, res, next) => {
  try {
    const stats = await getOverviewStats();
    res.status(200).json({ status: 'success', data: stats });
  } catch (error) {
    next(error);
  }
};

const getOrgs = async (req, res, next) => {
  try {
    const orgs = await listOrgsWithCafes();
    res.status(200).json({ status: 'success', data: orgs });
  } catch (error) {
    next(error);
  }
};

const getCafeSubscriptions = async (req, res, next) => {
  try {
    const { cafeId } = req.params;
    const history = await getCafeSubscriptionHistory(cafeId);
    res.status(200).json({ status: 'success', data: history });
  } catch (error) {
    next(error);
  }
};

const postCafeSubscription = async (req, res, next) => {
  try {
    const { cafeId } = req.params;
    const { org_id, term_months, price_per_month, note } = req.body;

    if (!org_id) {
      throw new BadRequestError('org_id is required');
    }
    const termMonths = Number(term_months);
    if (!VALID_TERM_MONTHS.includes(termMonths)) {
      throw new BadRequestError(`term_months must be one of ${VALID_TERM_MONTHS.join(', ')}`);
    }
    const pricePerMonth = Number(price_per_month);
    if (!Number.isFinite(pricePerMonth) || pricePerMonth < 0) {
      throw new BadRequestError('price_per_month must be a non-negative number');
    }

    const subscription = await recordSubscriptionTerm({
      cafeId,
      orgId: org_id,
      termMonths,
      pricePerMonth,
      adminUserId: req.user._id,
      note,
    });

    res.status(201).json({ status: 'success', data: subscription });
  } catch (error) {
    next(error);
  }
};

const patchCafeSubscriptionStatus = async (req, res, next) => {
  try {
    const { cafeId } = req.params;
    const { status, note } = req.body;

    if (!VALID_STATUSES.includes(status)) {
      throw new BadRequestError(`status must be one of ${VALID_STATUSES.join(', ')}`);
    }

    const subscription = await setSubscriptionStatus({
      cafeId,
      status,
      adminUserId: req.user._id,
      note,
    });

    res.status(200).json({ status: 'success', data: subscription });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOverview,
  getOrgs,
  getCafeSubscriptions,
  postCafeSubscription,
  patchCafeSubscriptionStatus,
};
```

- [ ] **Step 4: Create the routes file**

Create `backend/src/routes/v1/platformAdminRoutes.js`:

```js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { requirePlatformAdmin } = require('../../middleware/requirePlatformAdmin');
const {
  getOverview,
  getOrgs,
  getCafeSubscriptions,
  postCafeSubscription,
  patchCafeSubscriptionStatus,
} = require('../../controllers/platformAdmin/platformAdminController');

router.use(authenticate, requirePlatformAdmin);

router.get('/overview', getOverview);
router.get('/orgs', getOrgs);
router.get('/cafes/:cafeId/subscriptions', getCafeSubscriptions);
router.post('/cafes/:cafeId/subscriptions', postCafeSubscription);
router.patch('/cafes/:cafeId/subscriptions/status', patchCafeSubscriptionStatus);

module.exports = router;
```

- [ ] **Step 5: Mount the route**

In `backend/src/routes/index.js`, add the import and mount line:

```js
const platformAdminRoutes = require('./v1/platformAdminRoutes');
```

```js
router.use('/v1/platform-admin', platformAdminRoutes);
```

(Add both alongside the existing requires/mounts — order relative to the others doesn't matter, Express matches by path.)

- [ ] **Step 6: Add `is_platform_admin` to `getMe`**

In `backend/src/controllers/authController.js`, find the `getMe` function's response object (the one with `id, name, email, phone, staff_memberships`) and add one field:

```js
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        staff_memberships: user.staff_memberships,
        is_platform_admin: user.is_platform_admin,
      },
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
npx jest tests/integration/platformAdminRoutes.test.js --runInBand
```

Expected: PASS (13 tests).

- [ ] **Step 8: Run the full backend suite**

```bash
npx jest --runInBand
```

Expected: PASS, all suites (re-run `concurrencyBooking.test.js` alone if it flakes under load, as in Task 1).

- [ ] **Step 9: Commit**

```bash
git add backend/src/controllers/platformAdmin/platformAdminController.js backend/src/routes/v1/platformAdminRoutes.js backend/src/routes/index.js backend/src/controllers/authController.js backend/tests/integration/platformAdminRoutes.test.js
git commit -m "feat: add platform-admin subscription routes, expose is_platform_admin on /auth/me"
```

---

### Task 6: Grant-access script

**Files:**
- Create: `backend/scripts/grantPlatformAdmin.js`

**Interfaces:**
- Consumes: `User` model.
- Produces: a CLI script, no exports (mirrors `backend/scripts/seed.js`'s shape — a top-level async function that connects, does the work, and calls `process.exit`).

- [ ] **Step 1: Create the script**

Create `backend/scripts/grantPlatformAdmin.js`:

```js
const mongoose = require('mongoose');
const config = require('../src/config/env');
const User = require('../src/models/User');

/**
 * Grants (or revokes) platform-admin access for a user by email. This is
 * deliberately the ONLY way to set User.is_platform_admin — there is no API
 * endpoint or UI that can set it, since it grants cross-tenant access to
 * every organization's data.
 *
 * Usage:
 *   node scripts/grantPlatformAdmin.js user@example.com
 *   node scripts/grantPlatformAdmin.js user@example.com --revoke
 */
const run = async () => {
  const email = process.argv[2];
  const revoke = process.argv.includes('--revoke');

  if (!email) {
    console.error('Usage: node scripts/grantPlatformAdmin.js <email> [--revoke]');
    process.exit(1);
  }

  try {
    await mongoose.connect(config.MONGO_URI);

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      console.error(`❌ No user found with email: ${email}`);
      process.exit(1);
    }

    user.is_platform_admin = !revoke;
    await user.save();

    console.log(
      `✅ ${revoke ? 'Revoked' : 'Granted'} platform-admin access for ${user.email} (${user._id})`
    );
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to update platform-admin access:', error);
    process.exit(1);
  }
};

run();
```

- [ ] **Step 2: Verify it runs against your local DB**

Run from `backend/` (this touches your real local MongoDB, not the test DB — use an email you actually control, e.g. the `staff@nextbooq.com` seeded user, or your own account once you've registered one):

```bash
node scripts/grantPlatformAdmin.js staff@nextbooq.com
```

Expected: prints `✅ Granted platform-admin access for staff@nextbooq.com (<some ObjectId>)`.

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/grantPlatformAdmin.js
git commit -m "feat: add grantPlatformAdmin script"
```

---

### Task 7: Frontend types + route protection

**Files:**
- Modify: `frontend/src/lib/types/models.d.ts`
- Modify: `frontend/src/lib/route-guard.ts`
- Test: `frontend/src/lib/route-guard.test.ts`

**Interfaces:**
- Consumes: nothing from earlier frontend tasks (first frontend task).
- Produces: `User.is_platform_admin?: boolean` (flows through `AuthUser` automatically, since `AuthUser extends User`). New exported type `Subscription` and `OrgWithCafes` in `models.d.ts` for later tasks to import. `isDashboardRoute`/`resolveRedirect` in `route-guard.ts` also treat `/admin` and `/admin/*` as protected.

- [ ] **Step 1: Write the failing test**

Append these test cases to the existing `frontend/src/lib/route-guard.test.ts` (inside the existing `describe('resolveRedirect', ...)` and `describe('isDashboardRoute', ...)` blocks respectively — do not create new top-level describes):

In the `resolveRedirect` describe block, add:

```ts
  test('redirects /admin to login when there is no session', () => {
    expect(resolveRedirect('/admin', null)).toEqual({
      redirectTo: '/auth/login',
      callbackUrl: '/admin',
    });
  });

  test('returns null for /admin when a session cookie is present', () => {
    expect(resolveRedirect('/admin', validSessionCookie())).toBeNull();
  });
```

In the `isDashboardRoute` describe block, add a new `test.each`:

```ts
  test.each(['/admin', '/admin/cafes/123'])('%s is a protected route', (path) => {
    expect(isDashboardRoute(path)).toBe(true);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `frontend/`:

```bash
npx vitest run src/lib/route-guard.test.ts
```

Expected: FAIL — `/admin` currently matches neither `DASHBOARD_ROUTE_PATTERN` nor any redirect branch.

- [ ] **Step 3: Extend `route-guard.ts`**

In `frontend/src/lib/route-guard.ts`, change the pattern to also match `/admin` and its subpaths. Replace:

```ts
const DASHBOARD_ROUTE_PATTERN = /^\/[^/]+\/(dashboard|reservations|settings|tables|staff)/;
```

with:

```ts
const DASHBOARD_ROUTE_PATTERN = /^\/[^/]+\/(dashboard|reservations|settings|tables|staff)/;
// The platform-admin surface is a top-level route (not tenant-scoped like
// the pattern above), so it needs its own match — same protection policy
// (redirect to login without a session), different URL shape.
const ADMIN_ROUTE_PATTERN = /^\/admin(\/|$)/;

const isProtectedRoute = (pathname: string): boolean =>
  DASHBOARD_ROUTE_PATTERN.test(pathname) || ADMIN_ROUTE_PATTERN.test(pathname);
```

Then update both functions that currently call `DASHBOARD_ROUTE_PATTERN.test(...)` directly to call `isProtectedRoute(...)` instead:

```ts
export function isDashboardRoute(pathname: string): boolean {
  return isProtectedRoute(pathname);
}
```

```ts
  if (isProtectedRoute(pathname) && !hasSession) {
    return { redirectTo: '/auth/login', callbackUrl: pathname };
  }
```

(This is the same `if` block that currently reads `if (DASHBOARD_ROUTE_PATTERN.test(pathname) && !hasSession)` inside `resolveRedirect` — just swap the condition, the rest of the function is unchanged.)

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/lib/route-guard.test.ts
```

Expected: PASS (12 tests — 8 existing + 4 new).

- [ ] **Step 5: Add the new types to `models.d.ts`**

In `frontend/src/lib/types/models.d.ts`, add `is_platform_admin?: boolean;` to the `User` interface:

```ts
export interface User {
  id: string;
  _id?: string;
  email: string;
  name: string;
  phone?: string;
  staff_memberships: StaffMembership[];
  created_at?: string;
  is_platform_admin?: boolean;
}
```

Then add two new exported interfaces anywhere in the file (e.g. right after the `Cafe` interface):

```ts
export type SubscriptionTermMonths = 1 | 6 | 12 | 18;
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'inactive';

export interface Subscription {
  _id: string;
  org_id: string;
  cafe_id: string;
  term_months: SubscriptionTermMonths;
  price_per_month: number;
  period_start: string;
  current_period_end: string;
  status: SubscriptionStatus;
  is_current: boolean;
  note?: string;
  created_at: string;
}

// Deliberately NOT `extends Cafe`: the admin list/overview endpoints read
// with Mongoose's `.lean()` (plain objects, no virtuals), so the response
// only ever has `_id`, never the `id` virtual the main `Cafe` interface
// declares as required. Extending `Cafe` here would claim a field that
// never actually arrives over the wire.
export interface CafeWithSubscription {
  _id: string;
  org_id: string;
  name: string;
  slug: string;
  timezone: string;
  subscription: Subscription | null;
}

export interface OrgWithCafes {
  _id: string;
  name: string;
  cafes: CafeWithSubscription[];
}

export interface AdminOverviewStats {
  org_count: number;
  cafe_count: number;
  status_counts: Record<SubscriptionStatus, number>;
  pending_count: number;
  revenue: number;
}
```

- [ ] **Step 6: Type-check**

Run from `frontend/`:

```bash
npx tsc --noEmit
```

Expected: no output (clean) — these are additive type changes, nothing consumes them yet.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/route-guard.ts frontend/src/lib/route-guard.test.ts frontend/src/lib/types/models.d.ts
git commit -m "feat: protect /admin routes, add subscription types"
```

---

### Task 8: Admin overview page

**Files:**
- Create: `frontend/src/app/admin/layout.tsx`
- Create: `frontend/src/app/admin/page.tsx`
- Create: `frontend/src/hooks/admin/use-admin-overview.ts`
- Create: `frontend/src/hooks/admin/use-admin-orgs.ts`
- Test: `frontend/src/app/admin/page.test.tsx`
- Test: `frontend/src/app/admin/layout.test.tsx`

**Interfaces:**
- Consumes: `AdminOverviewStats`, `OrgWithCafes` types (Task 7), `useAuth()` (existing, now returns a `user` with `is_platform_admin`), `axiosInstance` (existing).
- Produces: `useAdminOverview()` → `UseQueryResult<AdminOverviewStats>` (query key `['admin', 'overview']`). `useAdminOrgs()` → `UseQueryResult<OrgWithCafes[]>` (query key `['admin', 'orgs']`). The page renders a `selectedCafeId: string | null` piece of state and a `handleSelectCafe(cafeId: string) => void` handler passed to each cafe row — Task 9 wires an actual drawer component into the (currently empty) space this state controls.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/admin/page.test.tsx`:

```tsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import AdminOverviewPage from './page';
import { axiosInstance } from '@/hooks/api/axios-instance';

vi.mock('@/hooks/api/axios-instance', () => ({
  axiosInstance: { get: vi.fn() },
}));

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminOverviewPage />
    </QueryClientProvider>
  );
};

describe('AdminOverviewPage', () => {
  beforeEach(() => {
    vi.mocked(axiosInstance.get).mockReset();
  });

  test('renders computed overview stats', async () => {
    vi.mocked(axiosInstance.get).mockImplementation((url: string) => {
      if (url === '/api/v1/platform-admin/overview') {
        return Promise.resolve({
          data: {
            data: {
              org_count: 3,
              cafe_count: 5,
              status_counts: { trial: 1, active: 3, past_due: 1, inactive: 0 },
              pending_count: 2,
              revenue: 91000,
            },
          },
        });
      }
      if (url === '/api/v1/platform-admin/orgs') {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('91000')).toBeInTheDocument());
    expect(screen.getByText('3')).toBeInTheDocument(); // org_count
    expect(screen.getByText('5')).toBeInTheDocument(); // cafe_count
    expect(screen.getByText('2')).toBeInTheDocument(); // pending_count
  });

  test('renders an "Unconfigured" badge for a cafe with no subscription', async () => {
    vi.mocked(axiosInstance.get).mockImplementation((url: string) => {
      if (url === '/api/v1/platform-admin/overview') {
        return Promise.resolve({
          data: { data: { org_count: 1, cafe_count: 1, status_counts: { trial: 0, active: 0, past_due: 0, inactive: 0 }, pending_count: 0, revenue: 0 } },
        });
      }
      if (url === '/api/v1/platform-admin/orgs') {
        return Promise.resolve({
          data: {
            data: [
              {
                _id: 'org1',
                name: 'Unconfigured Org',
                cafes: [{ _id: 'cafe1', name: 'Unconfigured Cafe', slug: 'unconf', subscription: null }],
              },
            ],
          },
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Unconfigured Cafe')).toBeInTheDocument());
    expect(screen.getByText(/unconfigured/i)).toBeInTheDocument();
  });

  test('clicking a cafe row selects it', async () => {
    vi.mocked(axiosInstance.get).mockImplementation((url: string) => {
      if (url === '/api/v1/platform-admin/overview') {
        return Promise.resolve({
          data: { data: { org_count: 1, cafe_count: 1, status_counts: { trial: 0, active: 1, past_due: 0, inactive: 0 }, pending_count: 0, revenue: 9000 } },
        });
      }
      if (url === '/api/v1/platform-admin/orgs') {
        return Promise.resolve({
          data: {
            data: [
              {
                _id: 'org1',
                name: 'Selectable Org',
                cafes: [{
                  _id: 'cafe1',
                  name: 'Selectable Cafe',
                  slug: 'selectable',
                  subscription: { _id: 'sub1', term_months: 1, price_per_month: 9000, status: 'active', current_period_end: '2027-01-01T00:00:00.000Z' },
                }],
              },
            ],
          },
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Selectable Cafe')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Selectable Cafe'));

    expect(screen.getByRole('row', { name: /selectable cafe/i })).toHaveAttribute('aria-selected', 'true');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `frontend/`:

```bash
npx vitest run src/app/admin/page.test.tsx
```

Expected: FAIL — `Failed to resolve import "./page"` (nothing exists at that path yet).

- [ ] **Step 3: Create the hooks**

Create `frontend/src/hooks/admin/use-admin-overview.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { AdminOverviewStats } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';

export const useAdminOverview = () => {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<AdminOverviewStats>>(
        '/api/v1/platform-admin/overview'
      );
      return data.data;
    },
    staleTime: 60 * 1000,
  });
};
```

Create `frontend/src/hooks/admin/use-admin-orgs.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { OrgWithCafes } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';

export const useAdminOrgs = () => {
  return useQuery({
    queryKey: ['admin', 'orgs'],
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<OrgWithCafes[]>>(
        '/api/v1/platform-admin/orgs'
      );
      return data.data || [];
    },
    staleTime: 60 * 1000,
  });
};
```

- [ ] **Step 4a: Write the failing layout redirect test**

Create `frontend/src/app/admin/layout.test.tsx`:

```tsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import AdminLayout from './layout';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const useAuthMock = vi.fn();
vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => useAuthMock(),
}));

describe('AdminLayout', () => {
  beforeEach(() => {
    replaceMock.mockReset();
  });

  test('redirects to login when the user is not a platform admin', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', name: 'Regular', is_platform_admin: false },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<AdminLayout>{'child content'}</AdminLayout>);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/auth/login'));
  });

  test('redirects to login when there is no authenticated user at all', async () => {
    useAuthMock.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false });

    render(<AdminLayout>{'child content'}</AdminLayout>);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/auth/login'));
  });

  test('renders children without redirecting for a platform admin', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', name: 'Admin', is_platform_admin: true },
      isAuthenticated: true,
      isLoading: false,
    });

    const { findByText } = render(<AdminLayout>{'child content'}</AdminLayout>);

    await findByText('child content');
    expect(replaceMock).not.toHaveBeenCalled();
  });

  test('renders nothing while auth is still loading', () => {
    useAuthMock.mockReturnValue({ user: null, isAuthenticated: false, isLoading: true });

    const { queryByText } = render(<AdminLayout>{'child content'}</AdminLayout>);

    expect(queryByText('child content')).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4b: Run the test to verify it fails**

```bash
npx vitest run src/app/admin/layout.test.tsx
```

Expected: FAIL — `Failed to resolve import "./layout"`.

- [ ] **Step 4c: Create the layout**

Create `frontend/src/app/admin/layout.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { toast } from 'sonner';

/**
 * Platform-admin shell: nextBooq's own operator surface, not tenant-branded
 * (no TenantThemeProvider, no cafe colors — this page looks the same
 * regardless of which cafe you're looking at).
 *
 * This client-side check is defense-in-depth, same pattern as
 * [tenant]/(dashboard)/layout.tsx: the real gate is server-side
 * (requirePlatformAdmin on every /api/v1/platform-admin/* route). This just
 * avoids rendering the shell before that would 403.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user?.is_platform_admin) {
      toast.error("You don't have access to this area.");
      router.replace('/auth/login');
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading || !isAuthenticated || !user?.is_platform_admin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-lg font-bold">nextBooq — Platform Admin</h1>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4d: Run the layout test to verify it passes**

```bash
npx vitest run src/app/admin/layout.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Create the page**

Create `frontend/src/app/admin/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useAdminOverview } from '@/hooks/admin/use-admin-overview';
import { useAdminOrgs } from '@/hooks/admin/use-admin-orgs';
import { CafeWithSubscription } from '@/lib/types/models';
import { format } from 'date-fns';

const STAT_LABELS: { key: 'org_count' | 'cafe_count' | 'pending_count' | 'revenue'; label: string }[] = [
  { key: 'org_count', label: 'Organizations' },
  { key: 'cafe_count', label: 'Cafes' },
  { key: 'pending_count', label: 'Pending renewal' },
  { key: 'revenue', label: 'Revenue (₹/mo total contract value)' },
];

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-100 text-emerald-800';
    case 'trial':
      return 'bg-blue-100 text-blue-800';
    case 'past_due':
      return 'bg-amber-100 text-amber-800';
    case 'inactive':
      return 'bg-slate-200 text-slate-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

export default function AdminOverviewPage() {
  const { data: stats } = useAdminOverview();
  const { data: orgs = [] } = useAdminOrgs();
  const [selectedCafeId, setSelectedCafeId] = useState<string | null>(null);

  const handleSelectCafe = (cafeId: string) => setSelectedCafeId(cafeId);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {STAT_LABELS.map(({ key, label }) => (
          <div key={key} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold">{stats ? stats[key] : '—'}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Cafe</th>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Term</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Renews / expires</th>
            </tr>
          </thead>
          <tbody>
            {orgs.flatMap((org) =>
              org.cafes.map((cafe: CafeWithSubscription) => (
                <tr
                  key={cafe._id}
                  role="row"
                  aria-selected={selectedCafeId === cafe._id}
                  onClick={() => handleSelectCafe(cafe._id)}
                  aria-label={cafe.name}
                  className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${
                    selectedCafeId === cafe._id ? 'bg-slate-100' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-medium">{cafe.name}</td>
                  <td className="px-4 py-3 text-slate-600">{org.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {cafe.subscription ? `${cafe.subscription.term_months} mo @ ₹${cafe.subscription.price_per_month}/mo` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {cafe.subscription ? (
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(cafe.subscription.status)}`}>
                        {cafe.subscription.status}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
                        Unconfigured
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {cafe.subscription
                      ? format(new Date(cafe.subscription.current_period_end), 'MMM d, yyyy')
                      : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
npx vitest run src/app/admin/page.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/admin/layout.tsx frontend/src/app/admin/page.tsx frontend/src/hooks/admin/use-admin-overview.ts frontend/src/hooks/admin/use-admin-orgs.ts frontend/src/app/admin/page.test.tsx frontend/src/app/admin/layout.test.tsx
git commit -m "feat: add platform admin overview page"
```

---

### Task 9: Cafe subscription drawer — record term + change status + history

**Files:**
- Create: `frontend/src/components/admin/subscription-drawer.tsx`
- Create: `frontend/src/hooks/admin/use-cafe-subscriptions.ts`
- Create: `frontend/src/hooks/admin/use-record-subscription-term.ts`
- Create: `frontend/src/hooks/admin/use-set-subscription-status.ts`
- Modify: `frontend/src/app/admin/page.tsx`
- Test: `frontend/src/components/admin/subscription-drawer.test.tsx`

**Interfaces:**
- Consumes: `selectedCafeId` state and `handleSelectCafe` from `AdminOverviewPage` (Task 8) — this task adds the piece that renders when `selectedCafeId` is non-null. `Subscription`, `SubscriptionTermMonths`, `SubscriptionStatus` types (Task 7).
- Produces: `SubscriptionDrawer` component, props `{ cafeId: string | null; orgId: string | undefined; onClose: () => void }`. `useCafeSubscriptions(cafeId)` → `UseQueryResult<Subscription[]>` (query key `['admin', 'cafe-subscriptions', cafeId]`). `useRecordSubscriptionTerm(cafeId)` → mutation accepting `{ org_id: string; term_months: SubscriptionTermMonths; price_per_month: number; note?: string }`. `useSetSubscriptionStatus(cafeId)` → mutation accepting `{ status: SubscriptionStatus; note?: string }`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/admin/subscription-drawer.test.tsx`:

```tsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { SubscriptionDrawer } from './subscription-drawer';
import { axiosInstance } from '@/hooks/api/axios-instance';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/api/axios-instance', () => ({
  axiosInstance: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const renderDrawer = (props: Partial<React.ComponentProps<typeof SubscriptionDrawer>> = {}) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SubscriptionDrawer cafeId="cafe1" orgId="org1" onClose={vi.fn()} {...props} />
    </QueryClientProvider>
  );
};

describe('SubscriptionDrawer', () => {
  beforeEach(() => {
    vi.mocked(axiosInstance.get).mockReset();
    vi.mocked(axiosInstance.post).mockReset();
    vi.mocked(axiosInstance.patch).mockReset();
  });

  test('renders nothing when cafeId is null', () => {
    renderDrawer({ cafeId: null });
    expect(screen.queryByText(/record payment/i)).not.toBeInTheDocument();
  });

  test('renders subscription history for the given cafe', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({
      data: {
        data: [
          { _id: 's2', term_months: 12, price_per_month: 7000, status: 'active', period_start: '2026-03-01T00:00:00.000Z', current_period_end: '2027-03-01T00:00:00.000Z' },
          { _id: 's1', term_months: 1, price_per_month: 9000, status: 'inactive', period_start: '2026-01-01T00:00:00.000Z', current_period_end: '2026-02-01T00:00:00.000Z' },
        ],
      },
    });

    renderDrawer();

    await waitFor(() => expect(screen.getAllByText(/₹7000\/mo/i)[0]).toBeInTheDocument());
    expect(screen.getByText(/₹9000\/mo/i)).toBeInTheDocument();
  });

  test('submitting the record-term form calls the record endpoint with the right payload', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({ data: { data: [] } });
    vi.mocked(axiosInstance.post).mockResolvedValue({
      data: { data: { _id: 'new-sub', term_months: 12, price_per_month: 7000, status: 'active' } },
    });

    renderDrawer();

    await waitFor(() => expect(screen.getByLabelText(/term/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/term/i), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/price per month/i), { target: { value: '7000' } });
    fireEvent.click(screen.getByRole('button', { name: /record payment/i }));

    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledTimes(1));
    expect(vi.mocked(axiosInstance.post).mock.calls[0][0]).toBe(
      '/api/v1/platform-admin/cafes/cafe1/subscriptions'
    );
    expect(vi.mocked(axiosInstance.post).mock.calls[0][1]).toMatchObject({
      org_id: 'org1',
      term_months: 12,
      price_per_month: 7000,
    });
  });

  test('clicking a status button calls the status endpoint', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({
      data: { data: [{ _id: 's1', term_months: 1, price_per_month: 9000, status: 'active', period_start: '2026-01-01T00:00:00.000Z', current_period_end: '2026-02-01T00:00:00.000Z' }] },
    });
    vi.mocked(axiosInstance.patch).mockResolvedValue({
      data: { data: { _id: 's1', status: 'inactive' } },
    });

    renderDrawer();

    await waitFor(() => expect(screen.getByRole('button', { name: /disable/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /disable/i }));

    await waitFor(() => expect(axiosInstance.patch).toHaveBeenCalledTimes(1));
    expect(vi.mocked(axiosInstance.patch).mock.calls[0][0]).toBe(
      '/api/v1/platform-admin/cafes/cafe1/subscriptions/status'
    );
    expect(vi.mocked(axiosInstance.patch).mock.calls[0][1]).toMatchObject({ status: 'inactive' });
  });

  test('hides the status-change buttons when the cafe has no subscription yet', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({ data: { data: [] } });

    renderDrawer();

    await waitFor(() => expect(screen.getByText(/no plan set/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /disable/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/components/admin/subscription-drawer.test.tsx
```

Expected: FAIL — `Failed to resolve import "./subscription-drawer"`.

- [ ] **Step 3: Create the hooks**

Create `frontend/src/hooks/admin/use-cafe-subscriptions.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Subscription } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';

export const useCafeSubscriptions = (cafeId: string | null) => {
  return useQuery({
    queryKey: ['admin', 'cafe-subscriptions', cafeId],
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<Subscription[]>>(
        `/api/v1/platform-admin/cafes/${cafeId}/subscriptions`
      );
      return data.data || [];
    },
    enabled: !!cafeId,
  });
};
```

Create `frontend/src/hooks/admin/use-record-subscription-term.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Subscription, SubscriptionTermMonths } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';
import { toast } from 'sonner';

export interface RecordSubscriptionTermPayload {
  org_id: string;
  term_months: SubscriptionTermMonths;
  price_per_month: number;
  note?: string;
}

export const useRecordSubscriptionTerm = (cafeId: string | null) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: RecordSubscriptionTermPayload) => {
      const { data } = await axiosInstance.post<ApiResponse<Subscription>>(
        `/api/v1/platform-admin/cafes/${cafeId}/subscriptions`,
        payload
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cafe-subscriptions', cafeId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'orgs'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
      toast.success('Subscription term recorded');
    },
  });
};
```

Create `frontend/src/hooks/admin/use-set-subscription-status.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Subscription, SubscriptionStatus } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';
import { toast } from 'sonner';

export interface SetSubscriptionStatusPayload {
  status: SubscriptionStatus;
  note?: string;
}

export const useSetSubscriptionStatus = (cafeId: string | null) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SetSubscriptionStatusPayload) => {
      const { data } = await axiosInstance.patch<ApiResponse<Subscription>>(
        `/api/v1/platform-admin/cafes/${cafeId}/subscriptions/status`,
        payload
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cafe-subscriptions', cafeId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'orgs'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
      toast.success('Status updated');
    },
  });
};
```

- [ ] **Step 4: Create the component**

Create `frontend/src/components/admin/subscription-drawer.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { useCafeSubscriptions } from '@/hooks/admin/use-cafe-subscriptions';
import { useRecordSubscriptionTerm } from '@/hooks/admin/use-record-subscription-term';
import { useSetSubscriptionStatus } from '@/hooks/admin/use-set-subscription-status';
import { SubscriptionTermMonths, SubscriptionStatus } from '@/lib/types/models';

const TERM_OPTIONS: { value: SubscriptionTermMonths; label: string; defaultPrice: number }[] = [
  { value: 1, label: 'Monthly', defaultPrice: 9000 },
  { value: 6, label: '6 months', defaultPrice: 8000 },
  { value: 12, label: '12 months', defaultPrice: 7000 },
  { value: 18, label: '18 months', defaultPrice: 6000 },
];

const STATUS_ACTIONS: { value: SubscriptionStatus; label: string }[] = [
  { value: 'trial', label: 'Trial' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Disable' },
];

interface SubscriptionDrawerProps {
  cafeId: string | null;
  orgId: string | undefined;
  onClose: () => void;
}

export function SubscriptionDrawer({ cafeId, orgId, onClose }: SubscriptionDrawerProps) {
  const { data: history = [] } = useCafeSubscriptions(cafeId);
  const recordTerm = useRecordSubscriptionTerm(cafeId);
  const setStatus = useSetSubscriptionStatus(cafeId);

  const [termMonths, setTermMonths] = useState<SubscriptionTermMonths>(1);
  const [pricePerMonth, setPricePerMonth] = useState<number>(9000);
  const [note, setNote] = useState('');

  if (!cafeId) return null;

  const current = history.find((sub) => sub.is_current) || history[0] || null;
  const hasConfiguredPlan = history.length > 0;

  const handleTermChange = (value: SubscriptionTermMonths) => {
    setTermMonths(value);
    const option = TERM_OPTIONS.find((o) => o.value === value);
    if (option) setPricePerMonth(option.defaultPrice);
  };

  const handleSubmitTerm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    recordTerm.mutate({ org_id: orgId, term_months: termMonths, price_per_month: pricePerMonth, note });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold">Subscription</h2>
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-900">
            Close
          </button>
        </div>

        {!hasConfiguredPlan && (
          <p className="mb-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
            No plan set for this cafe yet — record its first term below.
          </p>
        )}

        {hasConfiguredPlan && current && (
          <div className="mb-6 space-y-2">
            <p className="text-sm text-slate-600">
              Current: {current.term_months} mo @ ₹{current.price_per_month}/mo — status {current.status}
            </p>
            <div className="flex gap-2">
              {STATUS_ACTIONS.map((action) => (
                <button
                  key={action.value}
                  onClick={() => setStatus.mutate({ status: action.value })}
                  disabled={setStatus.isPending}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmitTerm} className="mb-6 space-y-3 rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-bold">Record payment / renew</h3>
          <div>
            <label htmlFor="term-select" className="block text-xs font-medium text-slate-600">
              Term
            </label>
            <select
              id="term-select"
              aria-label="Term"
              value={termMonths}
              onChange={(e) => handleTermChange(Number(e.target.value) as SubscriptionTermMonths)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {TERM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="price-input" className="block text-xs font-medium text-slate-600">
              Price per month (₹)
            </label>
            <input
              id="price-input"
              aria-label="Price per month"
              type="number"
              min={0}
              value={pricePerMonth}
              onChange={(e) => setPricePerMonth(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="note-input" className="block text-xs font-medium text-slate-600">
              Note (optional)
            </label>
            <input
              id="note-input"
              aria-label="Note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Paid via UPI on Aug 11"
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={recordTerm.isPending || !orgId}
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Record payment
          </button>
        </form>

        <div>
          <h3 className="mb-2 text-sm font-bold">History</h3>
          <ul className="space-y-2 text-sm text-slate-600">
            {history.map((sub) => (
              <li key={sub._id} className="rounded-md border border-slate-100 p-2">
                {sub.term_months} mo @ ₹{sub.price_per_month}/mo — {sub.status} — since{' '}
                {format(new Date(sub.period_start), 'MMM d, yyyy')}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire it into the overview page**

In `frontend/src/app/admin/page.tsx`, add the import:

```tsx
import { SubscriptionDrawer } from '@/components/admin/subscription-drawer';
```

Find the cafe row currently used to look up `orgId` for the selected cafe (needed by the drawer's "record term" form), by adding this just above the `return` statement:

```tsx
  const selectedOrg = orgs.find((org) => org.cafes.some((cafe) => cafe._id === selectedCafeId));
```

Then add the drawer at the end of the returned JSX, immediately before the final closing `</div>`:

```tsx
      <SubscriptionDrawer
        cafeId={selectedCafeId}
        orgId={selectedOrg?._id}
        onClose={() => setSelectedCafeId(null)}
      />
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx vitest run src/components/admin/subscription-drawer.test.tsx src/app/admin/page.test.tsx
```

Expected: PASS (5 + 3 tests).

- [ ] **Step 7: Type-check and run the full frontend suite**

```bash
npx tsc --noEmit
```

Expected: no output.

```bash
npx vitest run
```

Expected: PASS, all suites.

- [ ] **Step 8: Run the full backend suite one more time**

Run from `backend/`:

```bash
npx jest --runInBand
```

Expected: PASS, all suites.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/admin/subscription-drawer.tsx frontend/src/components/admin/subscription-drawer.test.tsx frontend/src/hooks/admin/use-cafe-subscriptions.ts frontend/src/hooks/admin/use-record-subscription-term.ts frontend/src/hooks/admin/use-set-subscription-status.ts frontend/src/app/admin/page.tsx
git commit -m "feat: add subscription drawer for recording terms and changing cafe status"
```
