# Admin Cafe List — Search, Sort, Pagination, Owner Contact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add search (by cafe or org name), sort (name/date/time-remaining, asc/desc), and pagination to the platform-admin cafe table, plus owner contact details and a subscription time-remaining countdown in the cafe detail drawer.

**Architecture:** Backend attaches owner contact to the existing `GET /platform-admin/orgs` response (one extra query, no new endpoint). Frontend gets a new pure module (`cafe-rows.ts`) for flattening/filtering/sorting cafe rows, consumed by the admin page for its new search/sort/pagination UI; `SubscriptionDrawer` gets a new `cafe` prop to render the owner section and countdown.

**Tech Stack:** Next.js (React, TypeScript), Vitest + Testing Library (frontend), Express + Mongoose, Jest/Supertest (backend), `date-fns` for time formatting.

## Global Constraints

- Dataset is small (dozens of cafes) and expected to stay that way — search/sort/pagination are all client-side; no new query params on the `/platform-admin/orgs` API.
- Pagination is fixed at `PAGE_SIZE = 10`, hardcoded — no page-size selector.
- A cafe with more than one `role: 'owner'` staff membership shows whichever one the owner-lookup query finds first — no multi-owner UI.
- Cafes with no configured subscription, or whose current subscription has already lapsed (`current_period_end` in the past), always sort to the end when sorting by "time remaining," regardless of ascending/descending.

---

### Task 1: Backend — attach owner contact to the orgs listing

**Files:**
- Modify: `backend/src/services/subscriptionAdminService.js:1-2` (add `User` require), `backend/src/services/subscriptionAdminService.js:53-79` (`listOrgsWithCafes`)
- Test: `backend/tests/integration/platformAdminRoutes.test.js:75-84` (extend existing test), add new test after it

**Interfaces:**
- Produces: each cafe object in `GET /api/v1/platform-admin/orgs`'s response now has `owner: { name: string, email: string, phone: string } | null` alongside the existing `subscription` field.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/integration/platformAdminRoutes.test.js`, extend the existing test at line 75 to also assert owner contact (the `beforeEach` at the top of the file already creates a `cafeStaff` user with `role: 'owner'` on `cafe`, named `'Cafe Owner'`, email `'cafe-owner-route@test.com'`, phone `'+1555993002'`):

```javascript
  test('GET /orgs lists every org with its cafes', async () => {
    const res = await request(app)
      .get('/api/v1/platform-admin/orgs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const found = res.body.data.find((o) => o._id === org._id.toString());
    expect(found).toBeDefined();
    expect(found.cafes[0].subscription).toBeNull();
    expect(found.cafes[0].owner).toEqual({
      name: 'Cafe Owner',
      email: 'cafe-owner-route@test.com',
      phone: '+1555993002',
    });
  });

  test('GET /orgs returns owner: null for a cafe with no owner-role staff member', async () => {
    const ownerlessOrg = await Organization.create({ name: 'Ownerless Org' });
    await Cafe.create({
      org_id: ownerlessOrg._id,
      name: 'Ownerless Cafe',
      slug: 'ownerless-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });

    const res = await request(app)
      .get('/api/v1/platform-admin/orgs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const found = res.body.data.find((o) => o._id === ownerlessOrg._id.toString());
    expect(found).toBeDefined();
    expect(found.cafes[0].owner).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/integration/platformAdminRoutes.test.js -t "GET /orgs"`
Expected: the first test FAILs on the new `owner` assertion (`undefined` is not `{...}`); the second test FAILs because `found.cafes[0].owner` is `undefined`, not `null`.

- [ ] **Step 3: Implement owner attachment**

In `backend/src/services/subscriptionAdminService.js`, add the `User` require after the existing `Cafe` require (line 2):

```javascript
const Organization = require('../models/Organization');
const Cafe = require('../models/Cafe');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { NotFoundError } = require('../utils/errors');
```

Replace `listOrgsWithCafes` (lines 53-79) with:

```javascript
const listOrgsWithCafes = async () => {
  const [orgs, cafes, currentSubs] = await Promise.all([
    Organization.find({}).sort({ name: 1 }).lean(),
    Cafe.find({ is_deleted: false })
      .sort({ name: 1 })
      .select('-payments.razorpay_key_secret_encrypted -payments.razorpay_webhook_secret_encrypted')
      .lean(),
    Subscription.find({ is_current: true }).lean(),
  ]);

  const subByCafeId = new Map(currentSubs.map((sub) => [sub.cafe_id.toString(), sub]));

  const cafeIds = cafes.map((cafe) => cafe._id);
  const owners = await User.find(
    { 'staff_memberships.cafe_id': { $in: cafeIds }, 'staff_memberships.role': 'owner' },
    'name email phone staff_memberships'
  ).lean();

  const ownerByCafeId = new Map();
  for (const user of owners) {
    for (const membership of user.staff_memberships) {
      if (membership.role !== 'owner') continue;
      const cafeIdStr = membership.cafe_id.toString();
      if (!ownerByCafeId.has(cafeIdStr)) {
        ownerByCafeId.set(cafeIdStr, { name: user.name, email: user.email, phone: user.phone });
      }
    }
  }

  const cafesByOrgId = new Map();
  for (const cafe of cafes) {
    const orgIdStr = cafe.org_id.toString();
    if (!cafesByOrgId.has(orgIdStr)) cafesByOrgId.set(orgIdStr, []);
    cafesByOrgId.get(orgIdStr).push({
      ...cafe,
      subscription: subByCafeId.get(cafe._id.toString()) || null,
      owner: ownerByCafeId.get(cafe._id.toString()) || null,
    });
  }

  return orgs.map((org) => ({
    ...org,
    cafes: cafesByOrgId.get(org._id.toString()) || [],
  }));
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/integration/platformAdminRoutes.test.js`
Expected: PASS (all tests in the file, including the two above and the pre-existing "never leaks a cafe's encrypted Razorpay secrets" test).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/subscriptionAdminService.js backend/tests/integration/platformAdminRoutes.test.js
git commit -m "feat: attach owner contact to platform-admin orgs listing"
```

---

### Task 2: Frontend — extend the `CafeWithSubscription` type

**Files:**
- Modify: `frontend/src/lib/types/models.d.ts:70-78`

**Interfaces:**
- Produces: `CafeWithSubscription` now includes `owner: { name: string; email: string; phone: string } | null` and `created_at: string`, both consumed by Task 3 (`cafe-rows.ts`) and Task 4 (`SubscriptionDrawer`).

- [ ] **Step 1: Update the interface**

In `frontend/src/lib/types/models.d.ts`, replace lines 70-78:

```typescript
export interface CafeWithSubscription {
  _id: string;
  org_id: string;
  name: string;
  slug: string;
  timezone: string;
  subscription_status: string;
  subscription: Subscription | null;
  owner: { name: string; email: string; phone: string } | null;
  created_at: string;
}
```

- [ ] **Step 2: Verify the project still typechecks**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors (the only consumer, `frontend/src/app/admin/page.tsx`, only reads existing fields today — it doesn't construct `CafeWithSubscription` literals).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types/models.d.ts
git commit -m "feat: add owner and created_at to CafeWithSubscription type"
```

---

### Task 3: Frontend — `cafe-rows.ts` flatten/filter/sort module

**Files:**
- Create: `frontend/src/lib/admin/cafe-rows.ts`
- Test: `frontend/src/lib/admin/cafe-rows.test.ts`

**Interfaces:**
- Consumes: `OrgWithCafes`, `CafeWithSubscription` from `@/lib/types/models` (as extended in Task 2).
- Produces:
  ```typescript
  export interface CafeRow {
    cafe: CafeWithSubscription;
    orgId: string;
    orgName: string;
  }
  export type SortField = 'name' | 'date' | 'remaining';
  export type SortDir = 'asc' | 'desc';
  export function flattenCafeRows(orgs: OrgWithCafes[]): CafeRow[];
  export function filterCafeRows(rows: CafeRow[], query: string): CafeRow[];
  export function sortCafeRows(rows: CafeRow[], field: SortField, dir: SortDir): CafeRow[];
  ```
  Consumed by Task 5 (`admin/page.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/admin/cafe-rows.test.ts`:

```typescript
import { describe, test, expect, vi, afterEach } from 'vitest';
import { flattenCafeRows, filterCafeRows, sortCafeRows } from './cafe-rows';
import { OrgWithCafes, CafeWithSubscription } from '@/lib/types/models';

const makeCafe = (overrides: Partial<CafeWithSubscription> = {}): CafeWithSubscription => ({
  _id: 'cafe1',
  org_id: 'org1',
  name: 'Cafe One',
  slug: 'cafe-one',
  timezone: 'UTC',
  subscription_status: 'active',
  subscription: null,
  owner: null,
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const makeOrg = (overrides: Partial<OrgWithCafes> = {}): OrgWithCafes => ({
  _id: 'org1',
  name: 'Org One',
  cafes: [],
  ...overrides,
});

describe('flattenCafeRows', () => {
  test('produces one row per cafe with the owning org id and name attached', () => {
    const orgs: OrgWithCafes[] = [
      makeOrg({
        _id: 'org1',
        name: 'Acme Cafes',
        cafes: [makeCafe({ _id: 'cafe1', name: 'Acme Downtown' }), makeCafe({ _id: 'cafe2', name: 'Acme Uptown' })],
      }),
      makeOrg({ _id: 'org2', name: 'Beanhouse', cafes: [makeCafe({ _id: 'cafe3', name: 'Beanhouse Central' })] }),
    ];

    const rows = flattenCafeRows(orgs);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ cafe: orgs[0].cafes[0], orgId: 'org1', orgName: 'Acme Cafes' });
    expect(rows[2]).toEqual({ cafe: orgs[1].cafes[0], orgId: 'org2', orgName: 'Beanhouse' });
  });
});

describe('filterCafeRows', () => {
  const rows = flattenCafeRows([
    makeOrg({ _id: 'org1', name: 'Acme Cafes', cafes: [makeCafe({ _id: 'cafe1', name: 'Acme Downtown' })] }),
    makeOrg({ _id: 'org2', name: 'Beanhouse', cafes: [makeCafe({ _id: 'cafe2', name: 'Central Perk' })] }),
  ]);

  test('matches on cafe name, case-insensitively', () => {
    expect(filterCafeRows(rows, 'downtown')).toEqual([rows[0]]);
  });

  test('matches on org name, case-insensitively', () => {
    expect(filterCafeRows(rows, 'BEANHOUSE')).toEqual([rows[1]]);
  });

  test('returns every row for an empty or whitespace-only query', () => {
    expect(filterCafeRows(rows, '')).toEqual(rows);
    expect(filterCafeRows(rows, '   ')).toEqual(rows);
  });

  test('returns no rows when nothing matches', () => {
    expect(filterCafeRows(rows, 'nonexistent')).toEqual([]);
  });
});

describe('sortCafeRows', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('sorts by cafe name ascending and descending', () => {
    const rows = flattenCafeRows([
      makeOrg({ cafes: [makeCafe({ _id: 'c1', name: 'Zebra Cafe' }), makeCafe({ _id: 'c2', name: 'Alpha Cafe' })] }),
    ]);

    expect(sortCafeRows(rows, 'name', 'asc').map((r) => r.cafe.name)).toEqual(['Alpha Cafe', 'Zebra Cafe']);
    expect(sortCafeRows(rows, 'name', 'desc').map((r) => r.cafe.name)).toEqual(['Zebra Cafe', 'Alpha Cafe']);
  });

  test('sorts by cafe created_at ascending and descending', () => {
    const rows = flattenCafeRows([
      makeOrg({
        cafes: [
          makeCafe({ _id: 'c1', name: 'Newer', created_at: '2026-06-01T00:00:00.000Z' }),
          makeCafe({ _id: 'c2', name: 'Older', created_at: '2026-01-01T00:00:00.000Z' }),
        ],
      }),
    ]);

    expect(sortCafeRows(rows, 'date', 'asc').map((r) => r.cafe.name)).toEqual(['Older', 'Newer']);
    expect(sortCafeRows(rows, 'date', 'desc').map((r) => r.cafe.name)).toEqual(['Newer', 'Older']);
  });

  test('sorts by subscription time remaining, pushing no-countdown cafes to the end regardless of direction', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));

    const rows = flattenCafeRows([
      makeOrg({
        cafes: [
          makeCafe({
            _id: 'soon',
            name: 'Expires Soon',
            subscription: {
              _id: 's1', org_id: 'org1', cafe_id: 'soon', term_months: 1, price_per_month: 9000,
              period_start: '2026-05-01T00:00:00.000Z', current_period_end: '2026-06-10T00:00:00.000Z',
              status: 'active', is_current: true, created_at: '2026-05-01T00:00:00.000Z',
            },
          }),
          makeCafe({
            _id: 'later',
            name: 'Expires Later',
            subscription: {
              _id: 's2', org_id: 'org1', cafe_id: 'later', term_months: 12, price_per_month: 7000,
              period_start: '2026-01-01T00:00:00.000Z', current_period_end: '2027-01-01T00:00:00.000Z',
              status: 'active', is_current: true, created_at: '2026-01-01T00:00:00.000Z',
            },
          }),
          makeCafe({ _id: 'none', name: 'No Plan', subscription: null }),
          makeCafe({
            _id: 'lapsed',
            name: 'Already Lapsed',
            subscription: {
              _id: 's3', org_id: 'org1', cafe_id: 'lapsed', term_months: 1, price_per_month: 9000,
              period_start: '2026-01-01T00:00:00.000Z', current_period_end: '2026-02-01T00:00:00.000Z',
              status: 'inactive', is_current: true, created_at: '2026-01-01T00:00:00.000Z',
            },
          }),
        ],
      }),
    ]);

    const asc = sortCafeRows(rows, 'remaining', 'asc').map((r) => r.cafe.name);
    expect(asc.slice(0, 2)).toEqual(['Expires Soon', 'Expires Later']);
    expect(asc.slice(2)).toEqual(expect.arrayContaining(['No Plan', 'Already Lapsed']));

    const desc = sortCafeRows(rows, 'remaining', 'desc').map((r) => r.cafe.name);
    expect(desc.slice(0, 2)).toEqual(['Expires Later', 'Expires Soon']);
    expect(desc.slice(2)).toEqual(expect.arrayContaining(['No Plan', 'Already Lapsed']));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/admin/cafe-rows.test.ts`
Expected: FAIL — `Cannot find module './cafe-rows'` (the module doesn't exist yet).

- [ ] **Step 3: Implement `cafe-rows.ts`**

Create `frontend/src/lib/admin/cafe-rows.ts`:

```typescript
import { OrgWithCafes, CafeWithSubscription } from '@/lib/types/models';

export interface CafeRow {
  cafe: CafeWithSubscription;
  orgId: string;
  orgName: string;
}

export type SortField = 'name' | 'date' | 'remaining';
export type SortDir = 'asc' | 'desc';

export function flattenCafeRows(orgs: OrgWithCafes[]): CafeRow[] {
  return orgs.flatMap((org) =>
    org.cafes.map((cafe) => ({ cafe, orgId: org._id, orgName: org.name }))
  );
}

export function filterCafeRows(rows: CafeRow[], query: string): CafeRow[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return rows;
  return rows.filter(
    (row) =>
      row.cafe.name.toLowerCase().includes(trimmed) || row.orgName.toLowerCase().includes(trimmed)
  );
}

// Positive milliseconds remaining on the cafe's current subscription, or
// null if it has no subscription or the current one has already lapsed —
// used to push those cafes to the end when sorting by time remaining.
function remainingMs(cafe: CafeWithSubscription): number | null {
  if (!cafe.subscription) return null;
  const ms = new Date(cafe.subscription.current_period_end).getTime() - Date.now();
  return ms > 0 ? ms : null;
}

export function sortCafeRows(rows: CafeRow[], field: SortField, dir: SortDir): CafeRow[] {
  const sign = dir === 'asc' ? 1 : -1;

  if (field === 'name') {
    return [...rows].sort((a, b) => sign * a.cafe.name.localeCompare(b.cafe.name));
  }

  if (field === 'date') {
    return [...rows].sort(
      (a, b) =>
        sign * (new Date(a.cafe.created_at).getTime() - new Date(b.cafe.created_at).getTime())
    );
  }

  const withRemaining = rows.filter((row) => remainingMs(row.cafe) !== null);
  const withoutRemaining = rows.filter((row) => remainingMs(row.cafe) === null);
  withRemaining.sort((a, b) => sign * (remainingMs(a.cafe)! - remainingMs(b.cafe)!));
  return [...withRemaining, ...withoutRemaining];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/admin/cafe-rows.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/admin/cafe-rows.ts frontend/src/lib/admin/cafe-rows.test.ts
git commit -m "feat: add cafe-rows module for admin list flatten/filter/sort"
```

---

### Task 4: Frontend — owner contact and time remaining in `SubscriptionDrawer`

**Files:**
- Modify: `frontend/src/components/admin/subscription-drawer.tsx`
- Modify: `frontend/src/components/admin/subscription-drawer.test.tsx`

**Interfaces:**
- Consumes: `CafeWithSubscription` from `@/lib/types/models` (as extended in Task 2).
- Produces: `SubscriptionDrawer` now requires a `cafe: CafeWithSubscription | null` prop (in addition to the existing `cafeId`, `orgId`, `onClose`) — consumed by Task 5 (`admin/page.tsx`).

- [ ] **Step 1: Write the failing tests**

In `frontend/src/components/admin/subscription-drawer.test.tsx`, add a `cafe` fixture and pass it as the default prop, then add new test cases. Replace lines 1-20 with:

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { SubscriptionDrawer } from './subscription-drawer';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { CafeWithSubscription } from '@/lib/types/models';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/api/axios-instance', () => ({
  axiosInstance: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const makeCafe = (overrides: Partial<CafeWithSubscription> = {}): CafeWithSubscription => ({
  _id: 'cafe1',
  org_id: 'org1',
  name: 'Test Cafe',
  slug: 'test-cafe',
  timezone: 'UTC',
  subscription_status: 'active',
  subscription: null,
  owner: null,
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const renderDrawer = (props: Partial<React.ComponentProps<typeof SubscriptionDrawer>> = {}) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SubscriptionDrawer cafeId="cafe1" orgId="org1" cafe={makeCafe()} onClose={vi.fn()} {...props} />
    </QueryClientProvider>
  );
};
```

Then add these test cases inside the existing `describe('SubscriptionDrawer', ...)` block, after the last existing test:

```typescript
  test('renders owner name, email, and phone with mailto/tel links when the cafe has an owner', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({ data: { data: [] } });

    renderDrawer({
      cafe: makeCafe({ owner: { name: 'Priya Sharma', email: 'priya@example.com', phone: '+15551234567' } }),
    });

    expect(screen.getByText('Priya Sharma')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'priya@example.com' })).toHaveAttribute(
      'href',
      'mailto:priya@example.com'
    );
    expect(screen.getByRole('link', { name: '+15551234567' })).toHaveAttribute('href', 'tel:+15551234567');
  });

  test('shows a fallback message when the cafe has no owner assigned', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({ data: { data: [] } });

    renderDrawer({ cafe: makeCafe({ owner: null }) });

    expect(screen.getByText(/no owner assigned/i)).toBeInTheDocument();
  });

  test('shows time remaining for a subscription that has not lapsed', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({
      data: {
        data: [
          {
            _id: 's1', term_months: 12, price_per_month: 7000, status: 'active',
            period_start: '2026-01-01T00:00:00.000Z', current_period_end: '2099-01-01T00:00:00.000Z',
          },
        ],
      },
    });

    renderDrawer();

    await waitFor(() => expect(screen.getByText(/remaining$/i)).toBeInTheDocument());
  });

  test('shows an "Expired ... ago" message for a lapsed subscription', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({
      data: {
        data: [
          {
            _id: 's1', term_months: 1, price_per_month: 9000, status: 'past_due',
            period_start: '2026-01-01T00:00:00.000Z', current_period_end: '2026-02-01T00:00:00.000Z',
          },
        ],
      },
    });

    renderDrawer();

    await waitFor(() => expect(screen.getByText(/^expired .* ago$/i)).toBeInTheDocument());
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/admin/subscription-drawer.test.tsx`
Expected: FAIL — TypeScript error on the missing `cafe` prop, and the four new tests fail (no owner section or time-remaining text exists yet).

- [ ] **Step 3: Implement the owner section and time remaining**

In `frontend/src/components/admin/subscription-drawer.tsx`, update the imports (line 1-8) to add `formatDistanceToNow` and the `CafeWithSubscription` type:

```typescript
'use client';

import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { useCafeSubscriptions } from '@/hooks/admin/use-cafe-subscriptions';
import { useRecordSubscriptionTerm } from '@/hooks/admin/use-record-subscription-term';
import { useSetSubscriptionStatus } from '@/hooks/admin/use-set-subscription-status';
import { SubscriptionTermMonths, SubscriptionStatus, CafeWithSubscription } from '@/lib/types/models';
```

Update the props interface and function signature (lines 26-32):

```typescript
interface SubscriptionDrawerProps {
  cafeId: string | null;
  orgId: string | undefined;
  cafe: CafeWithSubscription | null;
  onClose: () => void;
}

export function SubscriptionDrawer({ cafeId, orgId, cafe, onClose }: SubscriptionDrawerProps) {
  const { data: history = [] } = useCafeSubscriptions(cafeId);
  const recordTerm = useRecordSubscriptionTerm(cafeId);
  const setStatus = useSetSubscriptionStatus(cafeId);

  const [termMonths, setTermMonths] = useState<SubscriptionTermMonths>(1);
  const [pricePerMonth, setPricePerMonth] = useState<number>(9000);
  const [note, setNote] = useState('');

  if (!cafeId || !cafe) return null;
```

Add the owner section right after the header `<div className="mb-6 flex items-center justify-between">...</div>` block (before the `{!hasConfiguredPlan && (...)}` line):

```tsx
        <div className="mb-4 rounded-lg border border-slate-200 p-3 text-sm">
          <h3 className="mb-1 text-xs font-bold uppercase text-slate-500">Owner</h3>
          {cafe.owner ? (
            <div className="space-y-0.5">
              <p className="font-medium">{cafe.owner.name}</p>
              <a href={`mailto:${cafe.owner.email}`} className="block text-blue-600 hover:underline">
                {cafe.owner.email}
              </a>
              <a href={`tel:${cafe.owner.phone}`} className="block text-blue-600 hover:underline">
                {cafe.owner.phone}
              </a>
            </div>
          ) : (
            <p className="text-slate-500">No owner assigned yet.</p>
          )}
        </div>

```

Add the time-remaining line inside the `{hasConfiguredPlan && current && (...)}` block, right after the "Current: ..." paragraph:

```tsx
            <p className="text-sm text-slate-600">
              Current: {current.term_months} mo @ ₹{current.price_per_month}/mo — status {current.status}
            </p>
            <p className="text-xs text-slate-500">
              {isLapsed(current)
                ? `Expired ${formatDistanceToNow(new Date(current.current_period_end))} ago`
                : `${formatDistanceToNow(new Date(current.current_period_end))} remaining`}
            </p>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/admin/subscription-drawer.test.tsx`
Expected: PASS (all tests, including the pre-existing ones — the fixture default `cafe` fixes the `renders nothing when cafeId is null` and remount tests since they no longer omit the now-required prop).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/subscription-drawer.tsx frontend/src/components/admin/subscription-drawer.test.tsx
git commit -m "feat: show owner contact and subscription time remaining in the drawer"
```

---

### Task 5: Frontend — search, sort, and pagination on the admin page

**Files:**
- Modify: `frontend/src/app/admin/page.tsx`
- Modify: `frontend/src/app/admin/page.test.tsx`

**Interfaces:**
- Consumes: `flattenCafeRows`, `filterCafeRows`, `sortCafeRows`, `SortField`, `SortDir` from `@/lib/admin/cafe-rows` (Task 3); `SubscriptionDrawer`'s new `cafe` prop (Task 4).

- [ ] **Step 1: Write the failing tests**

In `frontend/src/app/admin/page.test.tsx`, add these test cases inside the existing `describe('AdminOverviewPage', ...)` block, after the last existing test. They share a helper that builds an org with N cafes:

```typescript
  const buildOrgsResponse = (cafeCount: number) => ({
    data: {
      data: [
        {
          _id: 'org1',
          name: 'Big Org',
          cafes: Array.from({ length: cafeCount }, (_, i) => ({
            _id: `cafe${i + 1}`,
            name: `Cafe ${String(i + 1).padStart(2, '0')}`,
            slug: `cafe-${i + 1}`,
            subscription: null,
            subscription_status: 'active',
            owner: null,
            created_at: '2026-01-01T00:00:00.000Z',
          })),
        },
      ],
    },
  });

  const mockOverviewAnd = (orgsResponse: unknown) => {
    vi.mocked(axiosInstance.get).mockImplementation((url: string) => {
      if (url === '/api/v1/platform-admin/overview') {
        return Promise.resolve({
          data: { data: { org_count: 1, cafe_count: 1, status_counts: { trial: 0, active: 0, past_due: 0, inactive: 0 }, pending_count: 0, revenue: 0 } },
        });
      }
      if (url === '/api/v1/platform-admin/orgs') {
        return Promise.resolve(orgsResponse);
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
  };

  test('filters the cafe list by cafe name as the admin types', async () => {
    mockOverviewAnd({
      data: {
        data: [
          { _id: 'org1', name: 'Org A', cafes: [{ _id: 'c1', name: 'Roastery North', slug: 'rn', subscription: null, subscription_status: 'active', owner: null, created_at: '2026-01-01T00:00:00.000Z' }] },
          { _id: 'org2', name: 'Org B', cafes: [{ _id: 'c2', name: 'Central Perk', slug: 'cp', subscription: null, subscription_status: 'active', owner: null, created_at: '2026-01-01T00:00:00.000Z' }] },
        ],
      },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Roastery North')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/search cafes/i), { target: { value: 'central' } });

    expect(screen.queryByText('Roastery North')).not.toBeInTheDocument();
    expect(screen.getByText('Central Perk')).toBeInTheDocument();
  });

  test('filters the cafe list by organization name as the admin types', async () => {
    mockOverviewAnd({
      data: {
        data: [
          { _id: 'org1', name: 'Roastery Group', cafes: [{ _id: 'c1', name: 'Store One', slug: 's1', subscription: null, subscription_status: 'active', owner: null, created_at: '2026-01-01T00:00:00.000Z' }] },
          { _id: 'org2', name: 'Bean Co', cafes: [{ _id: 'c2', name: 'Store Two', slug: 's2', subscription: null, subscription_status: 'active', owner: null, created_at: '2026-01-01T00:00:00.000Z' }] },
        ],
      },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Store One')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/search cafes/i), { target: { value: 'bean co' } });

    expect(screen.queryByText('Store One')).not.toBeInTheDocument();
    expect(screen.getByText('Store Two')).toBeInTheDocument();
  });

  test('reverses row order when the sort direction is toggled', async () => {
    mockOverviewAnd({
      data: {
        data: [
          { _id: 'org1', name: 'Org A', cafes: [
            { _id: 'c1', name: 'Alpha', slug: 'a', subscription: null, subscription_status: 'active', owner: null, created_at: '2026-01-01T00:00:00.000Z' },
            { _id: 'c2', name: 'Zeta', slug: 'z', subscription: null, subscription_status: 'active', owner: null, created_at: '2026-01-01T00:00:00.000Z' },
          ] },
        ],
      },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    const rowsBefore = screen.getAllByRole('row').slice(1); // drop the header row
    expect(rowsBefore[0]).toHaveTextContent('Alpha');

    fireEvent.click(screen.getByRole('button', { name: /sort (ascending|descending)/i }));

    const rowsAfter = screen.getAllByRole('row').slice(1);
    expect(rowsAfter[0]).toHaveTextContent('Zeta');
  });

  test('paginates beyond the first page and disables Prev/Next at the boundaries', async () => {
    mockOverviewAnd(buildOrgsResponse(12));

    renderPage();

    await waitFor(() => expect(screen.getByText('Cafe 01')).toBeInTheDocument());
    expect(screen.queryByText('Cafe 11')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));

    await waitFor(() => expect(screen.getByText('Cafe 11')).toBeInTheDocument());
    expect(screen.queryByText('Cafe 01')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/app/admin/page.test.tsx`
Expected: FAIL — no search input, sort button, or Previous/Next buttons exist yet in `page.tsx`.

- [ ] **Step 3: Implement search, sort, and pagination**

Replace the full contents of `frontend/src/app/admin/page.tsx` with:

```tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAdminOverview } from '@/hooks/admin/use-admin-overview';
import { useAdminOrgs } from '@/hooks/admin/use-admin-orgs';
import { format } from 'date-fns';
import { SubscriptionDrawer } from '@/components/admin/subscription-drawer';
import {
  flattenCafeRows,
  filterCafeRows,
  sortCafeRows,
  SortField,
  SortDir,
} from '@/lib/admin/cafe-rows';

const STAT_LABELS: { key: 'org_count' | 'cafe_count' | 'pending_count' | 'revenue'; label: string }[] = [
  { key: 'org_count', label: 'Organizations' },
  { key: 'cafe_count', label: 'Cafes' },
  { key: 'pending_count', label: 'Pending renewal' },
  { key: 'revenue', label: 'Revenue (₹/mo total contract value)' },
];

const PAGE_SIZE = 10;

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
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const searchParams = useSearchParams();
  const requestedCafeId = searchParams.get('cafeId');

  useEffect(() => {
    if (requestedCafeId && orgs.some((org) => org.cafes.some((cafe) => cafe._id === requestedCafeId))) {
      setSelectedCafeId(requestedCafeId);
    }
  }, [requestedCafeId, orgs]);

  const allRows = useMemo(() => flattenCafeRows(orgs), [orgs]);
  const filteredRows = useMemo(() => filterCafeRows(allRows, searchQuery), [allRows, searchQuery]);
  const sortedRows = useMemo(
    () => sortCafeRows(filteredRows, sortField, sortDir),
    [filteredRows, sortField, sortDir]
  );
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pageRows = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSelectCafe = (cafeId: string) => setSelectedCafeId(cafeId);
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setPage(1);
  };
  const handleSortFieldChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortField(e.target.value as SortField);
    setPage(1);
  };
  const handleSortDirToggle = () => {
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    setPage(1);
  };

  const selectedRow = allRows.find((row) => row.cafe._id === selectedCafeId) || null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="text-2xl font-bold">Platform overview</h2><p className="text-sm text-slate-600">Organizations, cafes, and subscriptions.</p></div>
        <Link href="/admin/onboard-cafe" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Onboard Cafe</Link>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {STAT_LABELS.map(({ key, label }) => (
          <div key={key} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold">{stats ? stats[key] : '—'}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder="Search by cafe or organization name"
          aria-label="Search cafes"
          className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-64"
        />
        <select
          aria-label="Sort by"
          value={sortField}
          onChange={handleSortFieldChange}
          className="rounded-md border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="name">Name</option>
          <option value="date">Date added</option>
          <option value="remaining">Time remaining</option>
        </select>
        <button
          type="button"
          onClick={handleSortDirToggle}
          aria-label={sortDir === 'asc' ? 'Sort ascending' : 'Sort descending'}
          className="rounded-md border border-slate-300 px-2.5 py-2 text-sm font-semibold hover:bg-slate-50"
        >
          {sortDir === 'asc' ? '↑' : '↓'}
        </button>
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
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No cafes match your search.
                </td>
              </tr>
            ) : (
              pageRows.map(({ cafe, orgName }) => (
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
                  <td className="px-4 py-3 text-slate-600">{orgName}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {cafe.subscription ? `${cafe.subscription.term_months} mo @ ₹${cafe.subscription.price_per_month}/mo` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {cafe.subscription ? (
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(cafe.subscription.status)}`}>
                        {cafe.subscription.status}
                      </span>
                    ) : (
                      <span
                        className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
                        title={`No subscription recorded — cafe's booking status is currently "${cafe.subscription_status}"`}
                      >
                        Unconfigured ({cafe.subscription_status})
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

      <div className="flex items-center justify-between text-sm text-slate-600">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="rounded-md border border-slate-300 px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <span>Page {page} of {totalPages}</span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="rounded-md border border-slate-300 px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>

      <SubscriptionDrawer
        key={selectedCafeId}
        cafeId={selectedCafeId}
        orgId={selectedRow?.orgId}
        cafe={selectedRow?.cafe ?? null}
        onClose={() => setSelectedCafeId(null)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/app/admin/page.test.tsx`
Expected: PASS (all tests, including the three pre-existing ones — they use a single cafe, so they're unaffected by pagination, and the `Unconfigured Cafe` test fixture still works without `owner`/`created_at` at runtime since JS mocks aren't type-checked).

- [ ] **Step 5: Run the full frontend and backend suites**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: PASS, no type errors.

Run: `cd backend && npx jest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/admin/page.tsx frontend/src/app/admin/page.test.tsx
git commit -m "feat: add search, sort, and pagination to the admin cafe list"
```
