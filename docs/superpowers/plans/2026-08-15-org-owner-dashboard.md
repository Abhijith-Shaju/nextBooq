# Org Owner Dashboard & Role-Based Login Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an organization owner (a user who holds the `owner` staff role on every cafe in an org) a login redirect to a new `/org/dashboard` listing all their cafes, from which they can assign/remove cafe staff — while manager/host/staff-only users keep landing directly on their single cafe's dashboard as today.

**Architecture:** Org ownership is derived, not stored — computed server-side from existing `staff_memberships` by checking a user owns every non-deleted cafe under an org. It's exposed as `owner_org_id` on the auth user payload (same pattern as the existing `is_platform_admin` flag), consumed by the frontend redirect/route-guard logic, and enforced independently server-side on every new `/api/v1/org/*` route via a dedicated middleware.

**Tech Stack:** Express + Mongoose (backend), Next.js App Router + React Query + Vitest (frontend), Jest + Supertest (backend tests).

## Global Constraints

- Spec source: `docs/superpowers/specs/2026-08-15-org-owner-dashboard-design.md`.
- No schema changes to `Organization`, `Cafe`, or `User` — org ownership stays fully derived from existing `staff_memberships`.
- `owner_org_id` is computed once at login/`getMe` time (not per-request elsewhere) and is allowed to go stale until the user's next login, exactly like `is_platform_admin` today.
- Every new `/api/v1/org/*` route must independently re-derive and check org ownership server-side — never trust a client-supplied org id.
- Assignable roles from the org dashboard: `owner`, `manager`, `host`, `staff` (all four, per the approved spec).
- Staff assignment looks up by email only; it never creates an account or sends email/SMS (that's explicitly out of scope here).
- Follow existing code patterns exactly: controllers return `{ status: 'success', data }`; errors use the `AppError` subclasses in `backend/src/utils/errors.js`; frontend hooks use `axiosInstance` + `@tanstack/react-query`, typed with `ApiResponse<T>`.

---

## Task 1: Backend — org ownership derivation service

**Files:**
- Create: `backend/src/services/orgOwnershipService.js`
- Test: `backend/tests/integration/orgOwnershipService.test.js`

**Interfaces:**
- Produces: `getOwnedOrgId(user)` — async function. `user` is a Mongoose `User` document whose `staff_memberships.cafe_id` has been populated with at least `{ _id, org_id, is_deleted }` (i.e. populated via the existing `ACTIVE_STAFF_MEMBERSHIP_POPULATE`, which already selects `org_id`, and already filters to `is_deleted: false`). Returns a `Promise<string | null>` — the org id (as a string) the user owns every non-deleted cafe of, or `null` if none.

- [ ] **Step 1: Write the failing integration test**

Create `backend/tests/integration/orgOwnershipService.test.js`:

```javascript
const { getOwnedOrgId } = require('../../src/services/orgOwnershipService');
const Organization = require('../../src/models/Organization');
const Cafe = require('../../src/models/Cafe');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');

setupTestDB();

const ACTIVE_STAFF_MEMBERSHIP_POPULATE = {
  path: 'staff_memberships.cafe_id',
  select: 'name slug timezone org_id',
  match: { is_deleted: false },
};

describe('getOwnedOrgId', () => {
  test('returns the org id when the user owns every cafe in that org', async () => {
    const org = await Organization.create({ name: 'Two Cafe Org' });
    const cafeA = await Cafe.create({ org_id: org._id, name: 'A', slug: 'org-owner-a', timezone: 'UTC' });
    const cafeB = await Cafe.create({ org_id: org._id, name: 'B', slug: 'org-owner-b', timezone: 'UTC' });

    const user = await User.create({
      name: 'Owner',
      email: 'owner-both@example.com',
      phone: '+15550200001',
      password_hash: 'hash',
      staff_memberships: [
        { cafe_id: cafeA._id, role: 'owner', permissions: [] },
        { cafe_id: cafeB._id, role: 'owner', permissions: [] },
      ],
    });
    const populated = await User.findById(user._id).populate(ACTIVE_STAFF_MEMBERSHIP_POPULATE);

    await expect(getOwnedOrgId(populated)).resolves.toBe(org._id.toString());
  });

  test('returns null when the user owns only some of the org\'s cafes', async () => {
    const org = await Organization.create({ name: 'Partial Owner Org' });
    const cafeA = await Cafe.create({ org_id: org._id, name: 'A', slug: 'org-partial-a', timezone: 'UTC' });
    await Cafe.create({ org_id: org._id, name: 'B', slug: 'org-partial-b', timezone: 'UTC' });

    const user = await User.create({
      name: 'Partial Owner',
      email: 'owner-partial@example.com',
      phone: '+15550200002',
      password_hash: 'hash',
      staff_memberships: [{ cafe_id: cafeA._id, role: 'owner', permissions: [] }],
    });
    const populated = await User.findById(user._id).populate(ACTIVE_STAFF_MEMBERSHIP_POPULATE);

    await expect(getOwnedOrgId(populated)).resolves.toBeNull();
  });

  test('returns the org id for a single-cafe org the user owns', async () => {
    const org = await Organization.create({ name: 'Single Cafe Org' });
    const cafe = await Cafe.create({ org_id: org._id, name: 'Solo', slug: 'org-solo', timezone: 'UTC' });

    const user = await User.create({
      name: 'Solo Owner',
      email: 'owner-solo@example.com',
      phone: '+15550200003',
      password_hash: 'hash',
      staff_memberships: [{ cafe_id: cafe._id, role: 'owner', permissions: [] }],
    });
    const populated = await User.findById(user._id).populate(ACTIVE_STAFF_MEMBERSHIP_POPULATE);

    await expect(getOwnedOrgId(populated)).resolves.toBe(org._id.toString());
  });

  test('returns null for a manager who owns nothing', async () => {
    const org = await Organization.create({ name: 'Manager Only Org' });
    const cafe = await Cafe.create({ org_id: org._id, name: 'M', slug: 'org-manager-only', timezone: 'UTC' });

    const user = await User.create({
      name: 'Manager',
      email: 'manager-only@example.com',
      phone: '+15550200004',
      password_hash: 'hash',
      staff_memberships: [{ cafe_id: cafe._id, role: 'manager', permissions: [] }],
    });
    const populated = await User.findById(user._id).populate(ACTIVE_STAFF_MEMBERSHIP_POPULATE);

    await expect(getOwnedOrgId(populated)).resolves.toBeNull();
  });

  test('returns null for a user with no memberships', async () => {
    const user = await User.create({
      name: 'Nobody',
      email: 'nobody@example.com',
      phone: '+15550200005',
      password_hash: 'hash',
      staff_memberships: [],
    });
    const populated = await User.findById(user._id).populate(ACTIVE_STAFF_MEMBERSHIP_POPULATE);

    await expect(getOwnedOrgId(populated)).resolves.toBeNull();
  });

  test('ignores a soft-deleted cafe the user was owner of when checking coverage', async () => {
    const org = await Organization.create({ name: 'Deleted Cafe Org' });
    const cafeA = await Cafe.create({ org_id: org._id, name: 'A', slug: 'org-deleted-a', timezone: 'UTC' });
    await Cafe.create({ org_id: org._id, name: 'B', slug: 'org-deleted-b', timezone: 'UTC', is_deleted: true });

    const user = await User.create({
      name: 'Owner',
      email: 'owner-deleted-cafe@example.com',
      phone: '+15550200006',
      password_hash: 'hash',
      staff_memberships: [{ cafe_id: cafeA._id, role: 'owner', permissions: [] }],
    });
    const populated = await User.findById(user._id).populate(ACTIVE_STAFF_MEMBERSHIP_POPULATE);

    await expect(getOwnedOrgId(populated)).resolves.toBe(org._id.toString());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/integration/orgOwnershipService.test.js`
Expected: FAIL — `Cannot find module '../../src/services/orgOwnershipService'`

- [ ] **Step 3: Write the implementation**

Create `backend/src/services/orgOwnershipService.js`:

```javascript
const Cafe = require('../models/Cafe');

// Derives org ownership from staff_memberships rather than storing it: a
// user "owns" an org when they hold the `owner` role on every one of that
// org's non-deleted cafes. Expects `user.staff_memberships.cafe_id` to
// already be populated with at least { _id, org_id } and filtered to
// non-deleted cafes (see ACTIVE_STAFF_MEMBERSHIP_POPULATE in
// authUserResponse.js) — unpopulated (ObjectId) entries are skipped.
const getOwnedOrgId = async (user) => {
  const ownedCafeCountByOrgId = new Map();

  for (const membership of user.staff_memberships) {
    if (membership.role !== 'owner') continue;
    const cafe = membership.cafe_id;
    if (!cafe || typeof cafe !== 'object' || !cafe.org_id) continue;

    const orgIdStr = cafe.org_id.toString();
    ownedCafeCountByOrgId.set(orgIdStr, (ownedCafeCountByOrgId.get(orgIdStr) || 0) + 1);
  }

  for (const [orgIdStr, ownedCount] of ownedCafeCountByOrgId) {
    const totalCafeCount = await Cafe.countDocuments({ org_id: orgIdStr, is_deleted: false });
    if (totalCafeCount > 0 && totalCafeCount === ownedCount) {
      return orgIdStr;
    }
  }

  return null;
};

module.exports = { getOwnedOrgId };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest tests/integration/orgOwnershipService.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/orgOwnershipService.js backend/tests/integration/orgOwnershipService.test.js
git commit -m "feat: derive org ownership from per-cafe owner memberships"
```

---

## Task 2: Backend — expose `owner_org_id` on login/getMe

**Files:**
- Modify: `backend/src/utils/authUserResponse.js`
- Modify: `backend/src/controllers/authController.js:110-168` (`loginUser`), `:170-185` (`getMe`)
- Modify: `backend/tests/integration/authAccountSemantics.test.js:19-26` (`expectedAuthUserKeys`)
- Test: `backend/tests/integration/authAccountSemantics.test.js` (extend)

**Interfaces:**
- Consumes: `getOwnedOrgId(user)` from Task 1 (`backend/src/services/orgOwnershipService.js`).
- Produces: `buildAuthUserPayload(user, { ownerOrgId })` — same shape as today plus `owner_org_id: string | null` in its return object. Callers that omit the second argument get `owner_org_id: null` (register and quick-auth flows always create membershipless users, so they never need to compute it).

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/integration/authAccountSemantics.test.js` (in the `describe('normal account semantics', ...)` block, after the existing platform-admin test):

```javascript
  test('an org owner (owner role on every cafe in their org) gets owner_org_id on login and me', async () => {
    const Organization = require('../../src/models/Organization');
    const Cafe = require('../../src/models/Cafe');
    const org = await Organization.create({ name: 'Owner Semantics Org' });
    const cafe = await Cafe.create({ org_id: org._id, name: 'Cafe', slug: 'owner-semantics-cafe', timezone: 'UTC' });

    const password_hash = await bcrypt.hash('OrgOwnerPassword1!', 10);
    await User.create({
      name: 'Org Owner',
      email: 'org-owner-login@example.com',
      phone: '+15550100005',
      password_hash,
      staff_memberships: [{ cafe_id: cafe._id, role: 'owner', permissions: [] }],
    });

    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'org-owner-login@example.com',
      password: 'OrgOwnerPassword1!',
    });

    expect(login.status).toBe(200);
    expect(login.body.data.user.owner_org_id).toBe(org._id.toString());

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.data.token}`);

    expect(me.status).toBe(200);
    expect(me.body.data.owner_org_id).toBe(org._id.toString());
  });

  test('a manager (not owner of every cafe) gets owner_org_id null', async () => {
    const Organization = require('../../src/models/Organization');
    const Cafe = require('../../src/models/Cafe');
    const org = await Organization.create({ name: 'Manager Semantics Org' });
    const cafe = await Cafe.create({ org_id: org._id, name: 'Cafe', slug: 'manager-semantics-cafe', timezone: 'UTC' });

    const password_hash = await bcrypt.hash('ManagerPassword1!', 10);
    await User.create({
      name: 'Manager',
      email: 'manager-semantics-login@example.com',
      phone: '+15550100006',
      password_hash,
      staff_memberships: [{ cafe_id: cafe._id, role: 'manager', permissions: [] }],
    });

    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'manager-semantics-login@example.com',
      password: 'ManagerPassword1!',
    });

    expect(login.status).toBe(200);
    expect(login.body.data.user.owner_org_id).toBeNull();
  });
```

Also update the existing key-list assertion at the top of the file (line 19-26) to include the new field:

```javascript
const expectedAuthUserKeys = [
  'email',
  'id',
  'is_platform_admin',
  'name',
  'owner_org_id',
  'phone',
  'staff_memberships',
].sort();
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest tests/integration/authAccountSemantics.test.js`
Expected: FAIL — the key-list assertion fails (payload has no `owner_org_id` key yet) and the two new tests fail (`owner_org_id` is `undefined`, not the expected value/`null`).

- [ ] **Step 3: Implement**

Edit `backend/src/utils/authUserResponse.js` — change `buildAuthUserPayload`:

```javascript
const buildAuthUserPayload = (user, { ownerOrgId = null } = {}) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  is_platform_admin: Boolean(user.is_platform_admin),
  owner_org_id: ownerOrgId,
  staff_memberships: Array.isArray(user.staff_memberships)
    ? user.staff_memberships.filter((membership) => membership?.cafe_id)
    : [],
});
```

Edit `backend/src/controllers/authController.js`:

Add the import near the top (after line 7):
```javascript
const { getOwnedOrgId } = require('../services/orgOwnershipService');
```

In `loginUser` (around line 147-163), compute `ownerOrgId` right after the password check succeeds and before building the response:

```javascript
    const token = generateToken(user._id);
    setAuthCookie(res, token);

    const ownerOrgId = await getOwnedOrgId(user);

    await logAuditEvent({
      cafeId: null,
      entityType: 'User',
      entityId: user._id,
      action: 'LOGIN',
      performedByUserId: user._id,
    });

    res.status(200).json({
      status: 'success',
      data: {
        token,
        user: buildAuthUserPayload(user, { ownerOrgId }),
      },
    });
```

In `getMe` (around line 170-185):

```javascript
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate(ACTIVE_STAFF_MEMBERSHIP_POPULATE);

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const ownerOrgId = await getOwnedOrgId(user);

    res.status(200).json({
      status: 'success',
      data: buildAuthUserPayload(user, { ownerOrgId }),
    });
  } catch (error) {
    next(error);
  }
};
```

`registerUser` and `customerQuickAuth` are unchanged — they create users with `staff_memberships: []` (or, for quick-auth's existing-user branch, don't populate memberships at all), so `buildAuthUserPayload(user)` without the second argument already yields `owner_org_id: null`, which is correct.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest tests/integration/authAccountSemantics.test.js`
Expected: PASS (all tests, including the two new ones)

- [ ] **Step 5: Run the full backend test suite to check for regressions**

Run: `cd backend && npx jest`
Expected: PASS — no other test asserts an exact key list on the auth user payload besides the one just updated (confirm no other failures appear).

- [ ] **Step 6: Commit**

```bash
git add backend/src/utils/authUserResponse.js backend/src/controllers/authController.js backend/tests/integration/authAccountSemantics.test.js
git commit -m "feat: expose owner_org_id on login and getMe responses"
```

---

## Task 3: Backend — org owner middleware + `GET /api/v1/org/cafes`

**Files:**
- Create: `backend/src/middleware/requireOrgOwner.js`
- Create: `backend/src/controllers/org/orgController.js`
- Create: `backend/src/routes/v1/orgRoutes.js`
- Modify: `backend/src/routes/index.js:1-17`
- Test: `backend/tests/integration/orgRoutes.test.js`

**Interfaces:**
- Consumes: `getOwnedOrgId(user)` (Task 1), `ACTIVE_STAFF_MEMBERSHIP_POPULATE` (`backend/src/utils/authUserResponse.js`), `authenticate` (`backend/src/middleware/auth.js`), `ForbiddenError` (`backend/src/utils/errors.js`).
- Produces: `requireOrgOwner` Express middleware — sets `req.ownerOrgId: string` on success, calls `next(new ForbiddenError(...))` otherwise. Mounted at `/api/v1/org`, route `GET /cafes` returning `{ status: 'success', data: Array<{ _id, name, slug, subscription_status, today_reservation_count }> }`.

- [ ] **Step 1: Write the failing integration test**

Create `backend/tests/integration/orgRoutes.test.js`:

```javascript
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Organization = require('../../src/models/Organization');
const Cafe = require('../../src/models/Cafe');
const User = require('../../src/models/User');
const Reservation = require('../../src/models/Reservation');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Org routes', () => {
  let ownerToken, managerToken, org, cafeA, cafeB;

  beforeEach(async () => {
    org = await Organization.create({ name: 'Org Routes Test Org' });
    cafeA = await Cafe.create({
      org_id: org._id,
      name: 'Cafe A',
      slug: 'org-routes-cafe-a',
      timezone: 'UTC',
      subscription_status: 'active',
    });
    cafeB = await Cafe.create({
      org_id: org._id,
      name: 'Cafe B',
      slug: 'org-routes-cafe-b',
      timezone: 'UTC',
      subscription_status: 'trial',
    });

    const owner = await User.create({
      name: 'Org Owner',
      email: 'org-routes-owner@test.com',
      phone: '+15559930001',
      password_hash: 'pass',
      staff_memberships: [
        { cafe_id: cafeA._id, role: 'owner', permissions: [] },
        { cafe_id: cafeB._id, role: 'owner', permissions: [] },
      ],
    });
    ownerToken = jwt.sign({ id: owner._id.toString() }, config.JWT_SECRET);

    const manager = await User.create({
      name: 'Cafe Manager',
      email: 'org-routes-manager@test.com',
      phone: '+15559930002',
      password_hash: 'pass',
      staff_memberships: [{ cafe_id: cafeA._id, role: 'manager', permissions: [] }],
    });
    managerToken = jwt.sign({ id: manager._id.toString() }, config.JWT_SECRET);
  });

  test('an unauthenticated request gets 401', async () => {
    const res = await request(app).get('/api/v1/org/cafes');
    expect(res.status).toBe(401);
  });

  test('a manager (not org owner) gets 403', async () => {
    const res = await request(app)
      .get('/api/v1/org/cafes')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(403);
  });

  test('an org owner gets their org\'s cafes with subscription status and today\'s reservation count', async () => {
    const now = new Date();
    await Reservation.create({
      cafe_id: cafeA._id,
      user_id: (await User.create({
        name: 'Guest',
        email: 'org-routes-guest@test.com',
        phone: '+15559930003',
        password_hash: 'pass',
      }))._id,
      table_ids: [],
      start_time: now,
      end_time: new Date(now.getTime() + 60 * 60 * 1000),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'CONFIRMED',
    });

    const res = await request(app)
      .get('/api/v1/org/cafes')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    const cafeAResult = res.body.data.find((c) => c._id === cafeA._id.toString());
    expect(cafeAResult).toMatchObject({
      name: 'Cafe A',
      slug: 'org-routes-cafe-a',
      subscription_status: 'active',
      today_reservation_count: 1,
    });
    const cafeBResult = res.body.data.find((c) => c._id === cafeB._id.toString());
    expect(cafeBResult).toMatchObject({
      name: 'Cafe B',
      subscription_status: 'trial',
      today_reservation_count: 0,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/integration/orgRoutes.test.js`
Expected: FAIL — 404s (route doesn't exist yet)

- [ ] **Step 3: Write the middleware**

Create `backend/src/middleware/requireOrgOwner.js`:

```javascript
const { ForbiddenError } = require('../utils/errors');
const { getOwnedOrgId } = require('../services/orgOwnershipService');
const { ACTIVE_STAFF_MEMBERSHIP_POPULATE } = require('../utils/authUserResponse');
const User = require('../models/User');

// Gates the /api/v1/org/* namespace. Must run after `authenticate` — it
// re-derives ownership fresh on every request (never trusts the possibly
// stale owner_org_id from the caller's session) and attaches the result as
// req.ownerOrgId for downstream controllers to scope queries by.
const requireOrgOwner = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate(ACTIVE_STAFF_MEMBERSHIP_POPULATE);
    const ownerOrgId = await getOwnedOrgId(user);
    if (!ownerOrgId) {
      throw new ForbiddenError('Organization owner access required');
    }
    req.ownerOrgId = ownerOrgId;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { requireOrgOwner };
```

- [ ] **Step 4: Write the controller**

Create `backend/src/controllers/org/orgController.js`:

```javascript
const Cafe = require('../../models/Cafe');
const Reservation = require('../../models/Reservation');

const NON_COUNTED_STATUSES = ['CANCELLED', 'EXPIRED'];

const getCafes = async (req, res, next) => {
  try {
    const cafes = await Cafe.find({ org_id: req.ownerOrgId, is_deleted: false })
      .sort({ name: 1 })
      .lean();

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const cafeIds = cafes.map((cafe) => cafe._id);
    const counts = await Reservation.aggregate([
      {
        $match: {
          cafe_id: { $in: cafeIds },
          start_time: { $gte: startOfDay, $lte: endOfDay },
          status: { $nin: NON_COUNTED_STATUSES },
        },
      },
      { $group: { _id: '$cafe_id', count: { $sum: 1 } } },
    ]);
    const countByCafeId = new Map(counts.map((entry) => [entry._id.toString(), entry.count]));

    const data = cafes.map((cafe) => ({
      _id: cafe._id.toString(),
      name: cafe.name,
      slug: cafe.slug,
      subscription_status: cafe.subscription_status,
      today_reservation_count: countByCafeId.get(cafe._id.toString()) || 0,
    }));

    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

module.exports = { getCafes };
```

- [ ] **Step 5: Write the routes file**

Create `backend/src/routes/v1/orgRoutes.js`:

```javascript
const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { requireOrgOwner } = require('../../middleware/requireOrgOwner');
const { getCafes } = require('../../controllers/org/orgController');

router.use(authenticate, requireOrgOwner);

router.get('/cafes', getCafes);

module.exports = router;
```

- [ ] **Step 6: Mount the routes**

Edit `backend/src/routes/index.js`:

```javascript
const express = require('express');
const router = express.Router();

const authRoutes = require('./v1/authRoutes');
const publicRoutes = require('./v1/publicRoutes');
const protectedRoutes = require('./v1/protectedRoutes');
const webhookRoutes = require('./v1/webhookRoutes');
const platformAdminRoutes = require('./v1/platformAdminRoutes');
const orgRoutes = require('./v1/orgRoutes');

router.use('/v1/auth', authRoutes);
router.use('/v1/webhooks', webhookRoutes);
router.use('/v1', publicRoutes);
router.use('/v1', protectedRoutes);
router.use('/v1/platform-admin', platformAdminRoutes);
router.use('/v1/org', orgRoutes);

module.exports = router;
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd backend && npx jest tests/integration/orgRoutes.test.js`
Expected: PASS (3 tests)

- [ ] **Step 8: Commit**

```bash
git add backend/src/middleware/requireOrgOwner.js backend/src/controllers/org/orgController.js backend/src/routes/v1/orgRoutes.js backend/src/routes/index.js backend/tests/integration/orgRoutes.test.js
git commit -m "feat: add GET /api/v1/org/cafes for org owners"
```

---

## Task 4: Backend — assign/remove cafe staff

**Files:**
- Modify: `backend/src/controllers/org/orgController.js`
- Modify: `backend/src/routes/v1/orgRoutes.js`
- Modify: `backend/tests/integration/orgRoutes.test.js`

**Interfaces:**
- Produces: `POST /api/v1/org/cafes/:cafeId/staff` (body `{ email: string, role: 'owner'|'manager'|'host'|'staff' }`) → `{ status: 'success', data: { user_id, email, cafe_id, role } }`. `DELETE /api/v1/org/cafes/:cafeId/staff/:userId` → `{ status: 'success', data: { user_id, cafe_id } }`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/integration/orgRoutes.test.js`, inside the existing `describe` block:

```javascript
  describe('staff assignment', () => {
    let staffTarget;

    beforeEach(async () => {
      staffTarget = await User.create({
        name: 'Assignable Person',
        email: 'org-routes-assignable@test.com',
        phone: '+15559930010',
        password_hash: 'pass',
      });
    });

    test('assigns a manager role to an existing account by email', async () => {
      const res = await request(app)
        .post(`/api/v1/org/cafes/${cafeA._id}/staff`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'org-routes-assignable@test.com', role: 'manager' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        email: 'org-routes-assignable@test.com',
        cafe_id: cafeA._id.toString(),
        role: 'manager',
      });

      const updated = await User.findById(staffTarget._id);
      expect(updated.staff_memberships).toHaveLength(1);
      expect(updated.staff_memberships[0].role).toBe('manager');
    });

    test('updates the role in place if the user already has a membership on that cafe', async () => {
      staffTarget.staff_memberships.push({ cafe_id: cafeA._id, role: 'staff', permissions: [] });
      await staffTarget.save();

      const res = await request(app)
        .post(`/api/v1/org/cafes/${cafeA._id}/staff`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'org-routes-assignable@test.com', role: 'host' });

      expect(res.status).toBe(200);
      const updated = await User.findById(staffTarget._id);
      expect(updated.staff_memberships).toHaveLength(1);
      expect(updated.staff_memberships[0].role).toBe('host');
    });

    test('rejects an unknown email with 404 and makes no changes', async () => {
      const res = await request(app)
        .post(`/api/v1/org/cafes/${cafeA._id}/staff`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'no-such-account@test.com', role: 'manager' });

      expect(res.status).toBe(404);
    });

    test('rejects an invalid role with 400', async () => {
      const res = await request(app)
        .post(`/api/v1/org/cafes/${cafeA._id}/staff`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'org-routes-assignable@test.com', role: 'ceo' });

      expect(res.status).toBe(400);
    });

    test('rejects a cafe id that does not belong to the caller\'s org with 403', async () => {
      const otherOrg = await Organization.create({ name: 'Other Org' });
      const otherCafe = await Cafe.create({
        org_id: otherOrg._id,
        name: 'Other Cafe',
        slug: 'org-routes-other-cafe',
        timezone: 'UTC',
      });

      const res = await request(app)
        .post(`/api/v1/org/cafes/${otherCafe._id}/staff`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'org-routes-assignable@test.com', role: 'manager' });

      expect(res.status).toBe(403);
    });

    test('removes an existing staff membership', async () => {
      staffTarget.staff_memberships.push({ cafe_id: cafeA._id, role: 'staff', permissions: [] });
      await staffTarget.save();

      const res = await request(app)
        .delete(`/api/v1/org/cafes/${cafeA._id}/staff/${staffTarget._id}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      const updated = await User.findById(staffTarget._id);
      expect(updated.staff_memberships).toHaveLength(0);
    });

    test('returns 404 when removing a membership that does not exist', async () => {
      const res = await request(app)
        .delete(`/api/v1/org/cafes/${cafeA._id}/staff/${staffTarget._id}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest tests/integration/orgRoutes.test.js`
Expected: FAIL — 404s on the new routes (not defined yet)

- [ ] **Step 3: Extend the controller**

Edit `backend/src/controllers/org/orgController.js` — add near the top and at the bottom:

```javascript
const Cafe = require('../../models/Cafe');
const Reservation = require('../../models/Reservation');
const User = require('../../models/User');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../utils/errors');

const NON_COUNTED_STATUSES = ['CANCELLED', 'EXPIRED'];
const ASSIGNABLE_ROLES = ['owner', 'manager', 'host', 'staff'];

// ... getCafes unchanged ...

const assertCafeInOwnedOrg = async (cafeId, ownerOrgId) => {
  const cafe = await Cafe.findOne({ _id: cafeId, is_deleted: false });
  if (!cafe || cafe.org_id.toString() !== ownerOrgId.toString()) {
    throw new ForbiddenError('Cafe does not belong to your organization');
  }
  return cafe;
};

const postAssignStaff = async (req, res, next) => {
  try {
    const { cafeId } = req.params;
    const { email, role } = req.body;

    if (typeof email !== 'string' || !email.trim()) {
      throw new BadRequestError('email is required');
    }
    if (!ASSIGNABLE_ROLES.includes(role)) {
      throw new BadRequestError(`role must be one of ${ASSIGNABLE_ROLES.join(', ')}`);
    }

    await assertCafeInOwnedOrg(cafeId, req.ownerOrgId);

    const cleanEmail = email.trim().toLowerCase();
    const targetUser = await User.findOne({ email: cleanEmail });
    if (!targetUser) {
      throw new NotFoundError('No account found with that email');
    }

    const existingMembership = targetUser.staff_memberships.find(
      (membership) => membership.cafe_id.toString() === cafeId
    );
    if (existingMembership) {
      existingMembership.role = role;
    } else {
      targetUser.staff_memberships.push({ cafe_id: cafeId, role, permissions: [] });
    }
    await targetUser.save();

    res.status(200).json({
      status: 'success',
      data: {
        user_id: targetUser._id.toString(),
        email: targetUser.email,
        cafe_id: cafeId,
        role,
      },
    });
  } catch (error) {
    next(error);
  }
};

const deleteStaff = async (req, res, next) => {
  try {
    const { cafeId, userId } = req.params;

    await assertCafeInOwnedOrg(cafeId, req.ownerOrgId);

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      throw new NotFoundError('User not found');
    }

    const beforeCount = targetUser.staff_memberships.length;
    targetUser.staff_memberships = targetUser.staff_memberships.filter(
      (membership) => membership.cafe_id.toString() !== cafeId
    );
    if (targetUser.staff_memberships.length === beforeCount) {
      throw new NotFoundError('User has no staff membership on this cafe');
    }
    await targetUser.save();

    res.status(200).json({
      status: 'success',
      data: { user_id: userId, cafe_id: cafeId },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getCafes, postAssignStaff, deleteStaff };
```

- [ ] **Step 4: Wire the new routes**

Edit `backend/src/routes/v1/orgRoutes.js`:

```javascript
const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { requireOrgOwner } = require('../../middleware/requireOrgOwner');
const { getCafes, postAssignStaff, deleteStaff } = require('../../controllers/org/orgController');

router.use(authenticate, requireOrgOwner);

router.get('/cafes', getCafes);
router.post('/cafes/:cafeId/staff', postAssignStaff);
router.delete('/cafes/:cafeId/staff/:userId', deleteStaff);

module.exports = router;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx jest tests/integration/orgRoutes.test.js`
Expected: PASS (all tests)

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && npx jest`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/controllers/org/orgController.js backend/src/routes/v1/orgRoutes.js backend/tests/integration/orgRoutes.test.js
git commit -m "feat: let org owners assign and remove cafe staff by email"
```

---

## Task 5: Frontend — types + login redirect logic

**Files:**
- Modify: `frontend/src/lib/types/models.d.ts:166-175` (`User` interface)
- Modify: `frontend/src/lib/auth/post-auth-destination.ts`
- Modify: `frontend/src/lib/auth/post-auth-destination.test.ts`

**Interfaces:**
- Consumes: `owner_org_id` field now present on the `/api/v1/auth/login` and `/api/v1/auth/me` responses (Task 2).
- Produces: `User.owner_org_id: string | null` in `models.d.ts`. `resolvePostAuthDestination` returns `/org/dashboard` for any user with a non-null `owner_org_id`, checked after the platform-admin branch and before the existing membership-slug fallback.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/lib/auth/post-auth-destination.test.ts`, inside the `describe` block (after the existing tests):

```typescript
  test('routes an org owner to the org dashboard even with only one cafe', () => {
    const orgOwner = { ...staffUser, owner_org_id: 'org-1' };
    expect(resolvePostAuthDestination(orgOwner)).toBe('/org/dashboard');
  });

  test('org owner takes priority over cafe-specific callback urls, but not over platform admin', () => {
    const orgOwner = { ...staffUser, owner_org_id: 'org-1' };
    expect(resolvePostAuthDestination(orgOwner, '/cafe-one/dashboard')).toBe('/org/dashboard');

    const orgOwnerAdmin = { ...orgOwner, is_platform_admin: true };
    expect(resolvePostAuthDestination(orgOwnerAdmin)).toBe('/admin');
  });

  test('a manager-only user (owner_org_id null) is unaffected and still goes to their cafe', () => {
    expect(resolvePostAuthDestination({ ...staffUser, owner_org_id: null })).toBe('/cafe-one/dashboard');
  });
```

Also update the shared fixtures at the top of the file to include the new field, so every existing test still type-checks:

```typescript
const customer = {
  id: 'customer-1',
  name: 'Customer',
  email: 'customer@example.com',
  staff_memberships: [],
  is_platform_admin: false,
  owner_org_id: null,
};
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/auth/post-auth-destination.test.ts`
Expected: FAIL — TypeScript error (`owner_org_id` doesn't exist on `AuthUser`) and/or the 3 new tests return `/cafe-one/dashboard` or `/` instead of `/org/dashboard`.

- [ ] **Step 3: Add the type**

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
}
```

- [ ] **Step 4: Implement the redirect logic**

Edit `frontend/src/lib/auth/post-auth-destination.ts`:

```typescript
import type { AuthUser } from '@/lib/types/auth';

/**
 * Frontend navigation policy only. This function decides the next browser URL
 * after authentication; it is not an authorization check. Every API and route
 * remains protected by its backend middleware and tenant RBAC.
 */

const ADMIN_ROUTE = /^\/admin(?:\/|$)/;
const ORG_ROUTE = /^\/org(?:\/|$)/;
const STAFF_ROUTE = /^\/([^/?#]+)\/(dashboard|reservations|settings|tables|staff)(?=\/|\?|#|$)/;
const CUSTOMER_ROUTE = /^\/[^/?#]+\/my-reservations(?=\/|\?|#|$)/;
const STAFF_ROLES = new Set(['owner', 'manager', 'host', 'staff']);

function validMembershipSlugs(user: AuthUser): string[] {
  return user.staff_memberships
    .map((membership) => {
      if (!STAFF_ROLES.has(membership.role)) return null;
      const cafe = membership.cafe_id;
      return typeof cafe === 'object' && typeof cafe.slug === 'string' && cafe.slug.length > 0
        ? cafe.slug
        : null;
    })
    .filter((slug): slug is string => slug !== null);
}

function normalizeSafePath(rawCallbackUrl?: string | null): string | null {
  if (!rawCallbackUrl || rawCallbackUrl.length > 2048) return null;
  if (!rawCallbackUrl.startsWith('/') || rawCallbackUrl.startsWith('//')) return null;
  if (/[\\ -]/.test(rawCallbackUrl)) return null;

  try {
    const url = new URL(rawCallbackUrl, 'https://nextbooq.local');
    if (url.origin !== 'https://nextbooq.local') return null;
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (url.pathname === '/onboarding' || url.pathname.startsWith('/onboarding/') || url.pathname.startsWith('/auth/')) {
      return null;
    }
    return path;
  } catch {
    return null;
  }
}

export function resolvePostAuthDestination(user: AuthUser | null | undefined, rawCallbackUrl?: string | null): string {
  if (!user) return '/';

  const callbackUrl = normalizeSafePath(rawCallbackUrl);
  if (user.is_platform_admin) {
    return callbackUrl && ADMIN_ROUTE.test(callbackUrl) ? callbackUrl : '/admin';
  }

  if (user.owner_org_id) {
    return callbackUrl && ORG_ROUTE.test(callbackUrl) ? callbackUrl : '/org/dashboard';
  }

  const memberSlugs = validMembershipSlugs(user);
  if (callbackUrl) {
    const staffMatch = callbackUrl.match(STAFF_ROUTE);
    if (staffMatch && memberSlugs.includes(staffMatch[1])) return callbackUrl;
    if (CUSTOMER_ROUTE.test(callbackUrl)) return callbackUrl;
  }

  return memberSlugs[0] ? `/${memberSlugs[0]}/dashboard` : '/';
}
```

Note: an org owner always lands on `/org/dashboard` regardless of cafe count, per the spec — this mirrors how the platform-admin branch above it also ignores any non-admin callback.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/auth/post-auth-destination.test.ts`
Expected: PASS (all tests, including the new ones)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/types/models.d.ts frontend/src/lib/auth/post-auth-destination.ts frontend/src/lib/auth/post-auth-destination.test.ts
git commit -m "feat: redirect org owners to /org/dashboard after login"
```

---

## Task 6: Frontend — route guard for `/org/*`

**Files:**
- Modify: `frontend/src/lib/route-guard.ts`
- Modify: `frontend/src/lib/route-guard.test.ts`

**Interfaces:**
- Produces: `isProtectedRoute` (internal) and `isDashboardRoute` (exported) now also match `/org/...` paths. `resolveRedirect` behavior for `/org/*` is identical to `/admin/*` today (redirect to `/auth/login?callbackUrl=...` when there's no session cookie).

- [ ] **Step 1: Write the failing tests**

First, read the existing `frontend/src/lib/route-guard.test.ts` in full to see its exact test structure (session-cookie mocking pattern), then add tests following that same structure for:
1. `/org/dashboard` with no session redirects to `/auth/login?callbackUrl=%2Forg%2Fdashboard`.
2. `/org/dashboard` with a valid session returns `null` (no redirect).
3. `isDashboardRoute('/org/dashboard')` returns `true`.

Use the exact mocking helpers already present in that file (e.g. however it stubs `hasValidSessionCookie` / constructs a fake `cookieHeader`) — do not introduce a new mocking approach.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/route-guard.test.ts`
Expected: FAIL — `/org/dashboard` is not currently matched by `isProtectedRoute`, so `resolveRedirect` returns `null` even without a session.

- [ ] **Step 3: Implement**

Edit `frontend/src/lib/route-guard.ts`:

```typescript
import { hasValidSessionCookie } from './session';

export interface RedirectDecision {
  redirectTo: string;
  callbackUrl: string;
}

const DASHBOARD_ROUTE_PATTERN = /^\/[^/]+\/(dashboard|reservations|settings|tables|staff)/;
// The platform-admin and org-owner surfaces are top-level routes (not
// tenant-scoped like the pattern above), so they need their own match — same
// protection policy (redirect to login without a session), different URL shape.
const ADMIN_ROUTE_PATTERN = /^\/admin(\/|$)/;
const ORG_ROUTE_PATTERN = /^\/org(\/|$)/;

const isProtectedRoute = (pathname: string): boolean =>
  DASHBOARD_ROUTE_PATTERN.test(pathname) || ADMIN_ROUTE_PATTERN.test(pathname) || ORG_ROUTE_PATTERN.test(pathname);

// The single source of truth for "is this a protected staff-dashboard route" —
// reused by the axios 401 interceptor so its redirect allowlist can't drift
// out of sync with the routes this middleware actually protects.
export function isDashboardRoute(pathname: string): boolean {
  return isProtectedRoute(pathname);
}

export function resolveRedirect(pathname: string, cookieHeader: string | null, search = ''): RedirectDecision | null {
  const hasSession = hasValidSessionCookie(cookieHeader);

  if (isProtectedRoute(pathname) && !hasSession) {
    return { redirectTo: '/auth/login', callbackUrl: `${pathname}${search}` };
  }

  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/route-guard.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/route-guard.ts frontend/src/lib/route-guard.test.ts
git commit -m "feat: protect /org routes in the route guard"
```

---

## Task 7: Frontend — org dashboard data hooks

**Files:**
- Create: `frontend/src/lib/types/org.ts`
- Create: `frontend/src/hooks/org/use-org-cafes.ts`
- Create: `frontend/src/hooks/org/use-assign-staff.ts`
- Create: `frontend/src/hooks/org/use-remove-staff.ts`

**Interfaces:**
- Consumes: `axiosInstance` (`frontend/src/hooks/api/axios-instance`), `ApiResponse<T>` (`frontend/src/lib/types/api-responses`), the `GET /api/v1/org/cafes`, `POST /api/v1/org/cafes/:cafeId/staff`, `DELETE /api/v1/org/cafes/:cafeId/staff/:userId` endpoints from Tasks 3–4.
- Produces: `OrgCafe` type (`{ _id, name, slug, subscription_status, today_reservation_count }`), `useOrgCafes()` query hook, `useAssignStaff(cafeId)` and `useRemoveStaff(cafeId)` mutation hooks — used by Task 8's page component.

This task has no server logic to unit-test in isolation (the hooks are thin wrappers verified via the page-level tests in Task 8), so it proceeds directly to implementation — consistent with how the existing `use-admin-orgs.ts` / `use-record-subscription-term.ts` hooks in this codebase have no dedicated test files of their own.

- [ ] **Step 1: Add the shared type**

Create `frontend/src/lib/types/org.ts`:

```typescript
export interface OrgCafe {
  _id: string;
  name: string;
  slug: string;
  subscription_status: string;
  today_reservation_count: number;
}
```

- [ ] **Step 2: Add the cafes-list query hook**

Create `frontend/src/hooks/org/use-org-cafes.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { ApiResponse } from '@/lib/types/api-responses';
import { OrgCafe } from '@/lib/types/org';

export const useOrgCafes = () => {
  return useQuery({
    queryKey: ['org', 'cafes'],
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<OrgCafe[]>>('/api/v1/org/cafes');
      return data.data || [];
    },
    staleTime: 30 * 1000,
  });
};
```

- [ ] **Step 3: Add the assign-staff mutation hook**

Create `frontend/src/hooks/org/use-assign-staff.ts`:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { ApiResponse } from '@/lib/types/api-responses';
import { toast } from 'sonner';

export interface AssignStaffPayload {
  email: string;
  role: 'owner' | 'manager' | 'host' | 'staff';
}

interface AssignStaffResult {
  user_id: string;
  email: string;
  cafe_id: string;
  role: string;
}

export const useAssignStaff = (cafeId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: AssignStaffPayload) => {
      const { data } = await axiosInstance.post<ApiResponse<AssignStaffResult>>(
        `/api/v1/org/cafes/${cafeId}/staff`,
        payload
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org', 'cafes'] });
      toast.success('Staff member assigned');
    },
  });
};
```

- [ ] **Step 4: Add the remove-staff mutation hook**

Create `frontend/src/hooks/org/use-remove-staff.ts`:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { toast } from 'sonner';

export const useRemoveStaff = (cafeId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      await axiosInstance.delete(`/api/v1/org/cafes/${cafeId}/staff/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org', 'cafes'] });
      toast.success('Staff member removed');
    },
  });
};
```

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors introduced by these 4 files.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/types/org.ts frontend/src/hooks/org/use-org-cafes.ts frontend/src/hooks/org/use-assign-staff.ts frontend/src/hooks/org/use-remove-staff.ts
git commit -m "feat: add data hooks for the org dashboard"
```

---

## Task 8: Frontend — `/org/dashboard` page and guard layout

**Files:**
- Create: `frontend/src/app/org/(dashboard)/layout.tsx`
- Create: `frontend/src/app/org/(dashboard)/layout.test.tsx`
- Create: `frontend/src/app/org/(dashboard)/page.tsx`
- Create: `frontend/src/app/org/(dashboard)/page.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (`frontend/src/components/providers/auth-provider`), `useOrgCafes`, `useAssignStaff`, `useRemoveStaff` (Task 7).

- [ ] **Step 1: Write the failing layout test**

Create `frontend/src/app/org/(dashboard)/layout.test.tsx`, mirroring `frontend/src/app/admin/layout.test.tsx`'s structure exactly (same mocks for `next/navigation`, `sonner`, and `@/components/providers/auth-provider`), but gated on `owner_org_id` instead of `is_platform_admin`:

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import OrgDashboardLayout from './layout';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/org/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const useAuthMock = vi.fn();
vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => useAuthMock(),
}));

describe('OrgDashboardLayout', () => {
  beforeEach(() => {
    replaceMock.mockReset();
  });

  test('redirects a non-owner user home instead of into a login loop', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', name: 'Regular', owner_org_id: null },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<OrgDashboardLayout>{'child content'}</OrgDashboardLayout>);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
  });

  test('redirects to login when there is no authenticated user at all', async () => {
    useAuthMock.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false });

    render(<OrgDashboardLayout>{'child content'}</OrgDashboardLayout>);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/auth/login?callbackUrl=%2Forg%2Fdashboard'));
  });

  test('renders children without redirecting for an org owner', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', name: 'Owner', owner_org_id: 'org-1' },
      isAuthenticated: true,
      isLoading: false,
    });

    const { findByText } = render(<OrgDashboardLayout>{'child content'}</OrgDashboardLayout>);

    await findByText('child content');
    expect(replaceMock).not.toHaveBeenCalled();
  });

  test('renders nothing while auth is still loading', () => {
    useAuthMock.mockReturnValue({ user: null, isAuthenticated: false, isLoading: true });

    const { queryByText } = render(<OrgDashboardLayout>{'child content'}</OrgDashboardLayout>);

    expect(queryByText('child content')).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run "src/app/org/(dashboard)/layout.test.tsx"`
Expected: FAIL — `Cannot find module './layout'`

- [ ] **Step 3: Implement the layout**

Create `frontend/src/app/org/(dashboard)/layout.tsx`:

```typescript
'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { toast } from 'sonner';

/**
 * Org-owner shell for /org/dashboard. Client-side check is defense-in-depth,
 * same pattern as app/admin/layout.tsx: the real gate is server-side
 * (requireOrgOwner on every /api/v1/org/* route). This just avoids rendering
 * the shell before that would 403.
 */
export default function OrgDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      const callbackUrl = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ''}`;
      router.replace(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }
    if (!user?.owner_org_id) {
      toast.error("You don't have access to this area.");
      router.replace('/');
    }
  }, [isLoading, isAuthenticated, user, router, pathname, searchParams]);

  if (isLoading || !isAuthenticated || !user?.owner_org_id) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-lg font-bold">Your Organization</h1>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run "src/app/org/(dashboard)/layout.test.tsx"`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing page test**

Create `frontend/src/app/org/(dashboard)/page.test.tsx`:

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import OrgDashboardPage from './page';

const cafesMock = vi.fn();
vi.mock('@/hooks/org/use-org-cafes', () => ({
  useOrgCafes: () => cafesMock(),
}));

const assignMutateMock = vi.fn();
vi.mock('@/hooks/org/use-assign-staff', () => ({
  useAssignStaff: () => ({ mutate: assignMutateMock, isPending: false }),
}));

describe('OrgDashboardPage', () => {
  beforeEach(() => {
    assignMutateMock.mockReset();
  });

  test('lists every cafe with its subscription status and reservation count', () => {
    cafesMock.mockReturnValue({
      data: [
        { _id: 'cafe-1', name: 'Cafe One', slug: 'cafe-one', subscription_status: 'active', today_reservation_count: 3 },
        { _id: 'cafe-2', name: 'Cafe Two', slug: 'cafe-two', subscription_status: 'trial', today_reservation_count: 0 },
      ],
    });

    render(<OrgDashboardPage />);

    expect(screen.getByText('Cafe One')).toBeInTheDocument();
    expect(screen.getByText('Cafe Two')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('trial')).toBeInTheDocument();
  });

  test('links each cafe card to its tenant dashboard', () => {
    cafesMock.mockReturnValue({
      data: [{ _id: 'cafe-1', name: 'Cafe One', slug: 'cafe-one', subscription_status: 'active', today_reservation_count: 0 }],
    });

    render(<OrgDashboardPage />);

    const link = screen.getByRole('link', { name: /Cafe One/i });
    expect(link).toHaveAttribute('href', '/cafe-one/dashboard');
  });

  test('submits the assign-staff form with email and role for the right cafe', async () => {
    cafesMock.mockReturnValue({
      data: [{ _id: 'cafe-1', name: 'Cafe One', slug: 'cafe-one', subscription_status: 'active', today_reservation_count: 0 }],
    });

    render(<OrgDashboardPage />);

    fireEvent.click(screen.getByRole('button', { name: /assign staff/i }));
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'new-manager@example.com' } });
    fireEvent.change(screen.getByLabelText(/role/i), { target: { value: 'manager' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(assignMutateMock).toHaveBeenCalledWith({ email: 'new-manager@example.com', role: 'manager' })
    );
  });

  test('shows an empty state when the org has no cafes', () => {
    cafesMock.mockReturnValue({ data: [] });

    render(<OrgDashboardPage />);

    expect(screen.getByText(/no cafes/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd frontend && npx vitest run "src/app/org/(dashboard)/page.test.tsx"`
Expected: FAIL — `Cannot find module './page'`

- [ ] **Step 7: Implement the page**

Create `frontend/src/app/org/(dashboard)/page.tsx`:

```typescript
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useOrgCafes } from '@/hooks/org/use-org-cafes';
import { useAssignStaff, AssignStaffPayload } from '@/hooks/org/use-assign-staff';
import { OrgCafe } from '@/lib/types/org';

const ROLE_OPTIONS: AssignStaffPayload['role'][] = ['owner', 'manager', 'host', 'staff'];

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

function AssignStaffForm({ cafeId, onDone }: { cafeId: string; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignStaffPayload['role']>('manager');
  const { mutate, isPending } = useAssignStaff(cafeId);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    mutate({ email, role }, { onSuccess: onDone });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={`email-${cafeId}`} className="text-xs font-medium text-slate-600">Email</label>
        <input
          id={`email-${cafeId}`}
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`role-${cafeId}`} className="text-xs font-medium text-slate-600">Role</label>
        <select
          id={`role-${cafeId}`}
          value={role}
          onChange={(event) => setRole(event.target.value as AssignStaffPayload['role'])}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        Save
      </button>
    </form>
  );
}

function CafeCard({ cafe }: { cafe: OrgCafe }) {
  const [assigning, setAssigning] = useState(false);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href={`/${cafe.slug}/dashboard`} className="font-semibold text-slate-900 hover:underline">
            {cafe.name}
          </Link>
          <p className="mt-1 text-sm text-slate-600">Today&apos;s reservations: {cafe.today_reservation_count}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(cafe.subscription_status)}`}>
          {cafe.subscription_status}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setAssigning((prev) => !prev)}
        className="mt-3 text-sm font-medium text-slate-700 hover:underline"
      >
        Assign staff
      </button>
      {assigning && <AssignStaffForm cafeId={cafe._id} onDone={() => setAssigning(false)} />}
    </div>
  );
}

export default function OrgDashboardPage() {
  const { data: cafes = [] } = useOrgCafes();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Your cafes</h2>
        <p className="text-sm text-slate-600">All cafes under your organization.</p>
      </div>

      {cafes.length === 0 ? (
        <p className="text-sm text-slate-500">No cafes found for your organization yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cafes.map((cafe) => (
            <CafeCard key={cafe._id} cafe={cafe} />
          ))}
        </div>
      )}
    </div>
  );
}
```

Note: `useRemoveStaff` (Task 7) is deliberately not imported here — the spec's org-dashboard scope only requires viewing cafes and assigning managers, not a remove-staff UI. The hook stays available in `frontend/src/hooks/org/use-remove-staff.ts` for a follow-up "remove staff" affordance; don't import it into this page just because it exists.

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd frontend && npx vitest run "src/app/org/(dashboard)/page.test.tsx"`
Expected: PASS (all tests)

- [ ] **Step 9: Run the full frontend test suite and type-check**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS, no new type errors

- [ ] **Step 10: Manual verification in the browser**

Start the dev servers (backend + frontend), create an org with two cafes and a user with `owner` role on both (via existing test/seed tooling or direct DB insert), log in as that user, and confirm:
- Login redirects to `/org/dashboard`.
- Both cafes appear with correct subscription status and reservation counts.
- "Assign staff" form successfully adds a role to another existing user's account (verify via that user's next login/`getMe` that `staff_memberships` updated).
- A manager/staff-only login still redirects straight to their own cafe dashboard, unaffected.

- [ ] **Step 11: Commit**

```bash
git add "frontend/src/app/org/(dashboard)/layout.tsx" "frontend/src/app/org/(dashboard)/layout.test.tsx" "frontend/src/app/org/(dashboard)/page.tsx" "frontend/src/app/org/(dashboard)/page.test.tsx"
git commit -m "feat: add /org/dashboard page for org owners to view cafes and assign staff"
```
