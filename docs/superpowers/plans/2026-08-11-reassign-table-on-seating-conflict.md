# Reassign Table on Seating Conflict — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a host tries to seat a party at a table another party is already seated at, offer a "Reassign" option that moves the reservation to an auto-suggested free table, alongside the existing "Seat Anyway" override.

**Architecture:** The allocation engine's best-fit selection logic is extracted into a reusable helper so a new `suggestAlternateTable` can reuse it against a table list filtered by *both* schedule overlap and live seated-occupancy. The host status endpoint returns that suggestion inside its existing 409 `TABLE_OCCUPIED` payload, and accepts a new `reassign: true` flag that re-resolves the suggestion and writes the new `table_ids` in the same atomic status update. The frontend conflict dialog becomes a two-step component: choose Seat Anyway / Reassign, then confirm the named table.

**Tech Stack:** Node.js + Express 5 + Mongoose 9 (backend), Jest + Supertest + mongodb-memory-server (backend tests), Next.js 15 + React 19 + TanStack Query + Zustand (frontend), Vitest + Testing Library (frontend tests).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-11-reassign-table-on-seating-conflict-design.md`.
- No schema/model changes. `Reservation.table_ids` already accepts any set of the cafe's active tables.
- Do not change the existing `force: true` behavior or its error messages — existing tests in `backend/tests/integration/tableOccupancyConflict.test.js` and `frontend/src/components/dashboard/reservation-drawer.test.tsx` must keep passing untouched.
- Do not change `allocateTables`' two distinct error messages: `'No available tables for the requested time slot'` (no tables at all) and `` `No available table layout can accommodate a party of ${partySize}` `` (tables exist, none fit).
- `transitionState` must not gain a MongoDB session/transaction — it is also called by the payment flows. Atomicity for this feature comes from folding `table_ids` into its existing OCC `findOneAndUpdate`.
- Backend tests run from `backend/`: `npx jest <path> --runInBand`. Frontend tests run from `frontend/`: `npx vitest run <path>`.
- The working tree already contains unrelated uncommitted work (operating-hours slot generation). Only `git add` the exact files each task names.

---

### Task 1: Extract best-fit selection from `allocateTables`

Pure refactor with no behavior change, so `suggestAlternateTable` (Task 3) can reuse the same selection rules new bookings use.

**Files:**
- Modify: `backend/src/services/allocationEngine.js:104-182`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `selectBestFit(availableTables, partySize)` → `{ tableIds: ObjectId[], tables: TableDoc[], totalCapacity: number, isMerged: boolean } | null`. Returns `null` when no single table and no connected merge combo (max depth 3) fits. Exported from `allocationEngine.js`.

- [ ] **Step 1: Run the existing allocation tests to confirm a green baseline**

Run from `backend/`:

```bash
npx jest tests/integration/reservationLogicRuthless.test.js tests/integration/concurrencyBooking.test.js tests/integration/mergeResolutionSoftDelete.test.js --runInBand
```

Expected: PASS. This is the regression net for the refactor — there is no new test in this task because behavior must not change.

- [ ] **Step 2: Add `selectBestFit` above `allocateTables`**

Insert this function immediately after `generateMergeCombinations` (i.e. before the `/** Best-Fit Table Allocation Engine */` comment) in `backend/src/services/allocationEngine.js`:

```js
/**
 * Picks the best-fit table (or connected merge combo) for a party from an
 * already-filtered list of available tables. Returns null when nothing fits,
 * leaving the choice of error message (or of not erroring at all) to the caller.
 */
const selectBestFit = (availableTables, partySize) => {
  // Single Table Fit
  const singleFitTables = availableTables
    .filter((t) => t.capacity >= partySize)
    .sort((a, b) => {
      if (a.capacity !== b.capacity) {
        return a.capacity - b.capacity;
      }
      return a.table_number.localeCompare(b.table_number, undefined, { numeric: true });
    });

  if (singleFitTables.length > 0) {
    const selected = singleFitTables[0];
    return {
      tableIds: [selected._id],
      tables: [selected],
      totalCapacity: selected.capacity,
      isMerged: false,
    };
  }

  // Multi-Table Merge Fallback (maxDepth = 3)
  const mergeCombinations = generateMergeCombinations(availableTables, partySize, 3);

  if (mergeCombinations.length === 0) {
    return null;
  }

  // Sort combinations deterministically:
  // 1) Lowest excess capacity
  // 2) Fewest tables
  // 3) Lowest starting table number
  mergeCombinations.sort((a, b) => {
    if (a.excessCapacity !== b.excessCapacity) {
      return a.excessCapacity - b.excessCapacity;
    }
    if (a.tableCount !== b.tableCount) {
      return a.tableCount - b.tableCount;
    }
    return a.startingTableNumber.localeCompare(b.startingTableNumber, undefined, { numeric: true });
  });

  const bestCombo = mergeCombinations[0];
  return {
    tableIds: bestCombo.tableIds,
    tables: bestCombo.tables,
    totalCapacity: bestCombo.totalCapacity,
    isMerged: true,
  };
};
```

- [ ] **Step 3: Replace the body of `allocateTables` from Step 3 onward**

Replace everything in `allocateTables` from the `// Step 3: Single Table Fit` comment through the closing `};` with:

```js
  const selection = selectBestFit(availableTables, partySize);

  if (!selection) {
    throw new UnprocessableEntityError(
      `No available table layout can accommodate a party of ${partySize}`
    );
  }

  return selection;
};
```

The `// Step 1` / `// Step 2` blocks (blocked-id lookup, table query, and the `'No available tables for the requested time slot'` throw) stay exactly as they are.

- [ ] **Step 4: Export `selectBestFit`**

Update the `module.exports` block at the bottom of `backend/src/services/allocationEngine.js`:

```js
module.exports = {
  allocateTables,
  getBlockedTableIds,
  generateMergeCombinations,
  selectBestFit,
};
```

- [ ] **Step 5: Run the full backend suite to prove nothing changed**

Run from `backend/`:

```bash
npx jest --runInBand
```

Expected: PASS, all suites. If `tests/integration/concurrencyBooking.test.js` fails on a "Expected: 49 / Received: N" assertion, re-run it alone (`npx jest tests/integration/concurrencyBooking.test.js --runInBand`) — that suite is known-flaky under full-suite load and passes in isolation.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/allocationEngine.js
git commit -m "refactor: extract selectBestFit from allocateTables"
```

---

### Task 2: Add `getSeatedTableIds` to the occupancy service

The alternate-table search needs the set of tables physically occupied right now, not just a single conflicting reservation.

**Files:**
- Modify: `backend/src/services/tableOccupancyService.js`
- Test: `backend/tests/integration/tableReassignOnConflict.test.js` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `getSeatedTableIds(cafeId, excludeReservationId)` → `Promise<Set<string>>` of table id strings currently held by `SEATED` reservations other than `excludeReservationId`. Exported from `tableOccupancyService.js`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/tableReassignOnConflict.test.js`:

```js
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const Reservation = require('../../src/models/Reservation');
const { getSeatedTableIds } = require('../../src/services/tableOccupancyService');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('getSeatedTableIds', () => {
  test('returns table ids held by other SEATED reservations, excluding the given one', async () => {
    const org = await Organization.create({ name: 'Seated Ids Org' });
    const cafe = await Cafe.create({
      org_id: org._id,
      name: 'Seated Ids Cafe',
      slug: 'seated-ids-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });

    const tableA = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
    const tableB = await Table.create({ cafe_id: cafe._id, table_number: 'B1', capacity: 4 });
    const tableC = await Table.create({ cafe_id: cafe._id, table_number: 'C1', capacity: 4 });

    const guest = await User.create({
      name: 'Guest',
      email: 'seated-ids@test.com',
      phone: '+1555920001',
      password_hash: 'pass',
    });

    const makeRes = (tableIds, status) =>
      Reservation.create({
        cafe_id: cafe._id,
        user_id: guest._id,
        table_ids: tableIds,
        start_time: new Date(Date.now() - 60 * 60 * 1000),
        end_time: new Date(Date.now() + 60 * 60 * 1000),
        party_size: 2,
        reservation_timezone: 'UTC',
        status,
      });

    await makeRes([tableA._id], 'SEATED');
    const self = await makeRes([tableB._id], 'SEATED');
    await makeRes([tableC._id], 'CHECKED_IN');

    const ids = await getSeatedTableIds(cafe._id, self._id);

    expect(ids.has(tableA._id.toString())).toBe(true);
    // Excluded: it's the reservation we're finding an alternate for.
    expect(ids.has(tableB._id.toString())).toBe(false);
    // CHECKED_IN guests are waiting at the host stand, not occupying a table.
    expect(ids.has(tableC._id.toString())).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `backend/`:

```bash
npx jest tests/integration/tableReassignOnConflict.test.js --runInBand
```

Expected: FAIL with `getSeatedTableIds is not a function`.

- [ ] **Step 3: Implement `getSeatedTableIds`**

In `backend/src/services/tableOccupancyService.js`, add below `findSeatedOccupancyConflict` and export it:

```js
/**
 * Collects every table currently held by a SEATED reservation at this cafe,
 * other than the one being seated. Deliberately ignores the reservations'
 * booked time windows: a party that is physically at a table still occupies
 * it after their slot has nominally ended, which is exactly the situation the
 * seating-conflict flow exists to surface.
 */
const getSeatedTableIds = async (cafeId, excludeReservationId) => {
  const seatedReservations = await Reservation.find({
    cafe_id: cafeId,
    _id: { $ne: excludeReservationId },
    status: 'SEATED',
  }).select('table_ids');

  const tableIds = new Set();
  for (const reservation of seatedReservations) {
    for (const tableId of reservation.table_ids) {
      tableIds.add(tableId.toString());
    }
  }

  return tableIds;
};

module.exports = {
  findSeatedOccupancyConflict,
  getSeatedTableIds,
};
```

Remove the old `module.exports = { findSeatedOccupancyConflict };` block so there is exactly one export statement.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest tests/integration/tableReassignOnConflict.test.js --runInBand
```

Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/tableOccupancyService.js backend/tests/integration/tableReassignOnConflict.test.js
git commit -m "feat: add getSeatedTableIds for live table occupancy lookup"
```

---

### Task 3: Add `suggestAlternateTable` to the allocation engine

**Files:**
- Modify: `backend/src/services/allocationEngine.js`
- Test: `backend/tests/integration/tableReassignOnConflict.test.js`

**Interfaces:**
- Consumes: `selectBestFit(availableTables, partySize)` (Task 1), `getSeatedTableIds(cafeId, excludeReservationId)` (Task 2).
- Produces: `suggestAlternateTable(cafeId, reservation)` → same shape as `selectBestFit`, or `null`. `reservation` is a Mongoose `Reservation` document with `_id`, `start_time`, `end_time`, `party_size`. Exported from `allocationEngine.js`.

- [ ] **Step 1: Write the failing test**

Append this `describe` block to `backend/tests/integration/tableReassignOnConflict.test.js`, and add `const { suggestAlternateTable } = require('../../src/services/allocationEngine');` to the requires at the top of the file:

```js
describe('suggestAlternateTable', () => {
  let cafe;
  let guest;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Suggest Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Suggest Cafe',
      slug: 'suggest-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });
    guest = await User.create({
      name: 'Guest',
      email: 'suggest@test.com',
      phone: '+1555930001',
      password_hash: 'pass',
    });
  });

  const makeRes = (tableIds, status, offsetHours, partySize = 2) =>
    Reservation.create({
      cafe_id: cafe._id,
      user_id: guest._id,
      table_ids: tableIds,
      start_time: new Date(Date.now() + offsetHours * 60 * 60 * 1000),
      end_time: new Date(Date.now() + (offsetHours + 1) * 60 * 60 * 1000),
      party_size: partySize,
      reservation_timezone: 'UTC',
      status,
    });

  test('suggests a free table when the assigned one is occupied', async () => {
    const tableA = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
    const tableB = await Table.create({ cafe_id: cafe._id, table_number: 'B1', capacity: 4 });

    await makeRes([tableA._id], 'SEATED', -1);
    const target = await makeRes([tableA._id], 'CONFIRMED', 2);

    const alternate = await suggestAlternateTable(cafe._id, target);

    expect(alternate).not.toBeNull();
    expect(alternate.tableIds.map((id) => id.toString())).toEqual([tableB._id.toString()]);
    expect(alternate.totalCapacity).toBe(4);
  });

  test('returns null when every other table is physically occupied right now', async () => {
    const tableA = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
    const tableB = await Table.create({ cafe_id: cafe._id, table_number: 'B1', capacity: 4 });

    await makeRes([tableA._id], 'SEATED', -1);
    await makeRes([tableB._id], 'SEATED', -1);
    const target = await makeRes([tableA._id], 'CONFIRMED', 2);

    expect(await suggestAlternateTable(cafe._id, target)).toBeNull();
  });

  test('returns null when the only other table is booked over the same window', async () => {
    const tableA = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
    const tableB = await Table.create({ cafe_id: cafe._id, table_number: 'B1', capacity: 4 });

    await makeRes([tableA._id], 'SEATED', -1);
    // Table B is free right now, but someone else has it booked for the
    // window this reservation would occupy.
    await makeRes([tableB._id], 'CONFIRMED', 2);
    const target = await makeRes([tableA._id], 'CONFIRMED', 2);

    expect(await suggestAlternateTable(cafe._id, target)).toBeNull();
  });

  test('returns null when the only free table is too small for the party', async () => {
    const tableA = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 6 });
    await Table.create({ cafe_id: cafe._id, table_number: 'B1', capacity: 2 });

    await makeRes([tableA._id], 'SEATED', -1);
    const target = await makeRes([tableA._id], 'CONFIRMED', 2, 6);

    expect(await suggestAlternateTable(cafe._id, target)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest tests/integration/tableReassignOnConflict.test.js --runInBand
```

Expected: FAIL with `suggestAlternateTable is not a function` on the four new tests.

- [ ] **Step 3: Implement `suggestAlternateTable`**

In `backend/src/services/allocationEngine.js`, add this require at the top, below the existing ones:

```js
const { getSeatedTableIds } = require('./tableOccupancyService');
```

Then add this function after `allocateTables`:

```js
/**
 * Finds an alternate table (or merge combo) a reservation could be seated at
 * instead of its currently-assigned one, backing the host-facing "reassign"
 * option on a seating conflict.
 *
 * Excludes tables blocked in two genuinely different ways:
 *   - schedule overlap: another reservation holds the table during this
 *     reservation's booked window. This also excludes this reservation's own
 *     tables (it overlaps itself), which is what we want — the whole point is
 *     to land on a different table.
 *   - live occupancy: another party is physically SEATED there right now,
 *     even if their booked window has already ended.
 *
 * Returns null when nothing else fits, so the caller can omit the suggestion
 * rather than offering the host a dead end.
 */
const suggestAlternateTable = async (cafeId, reservation) => {
  const blockedBySchedule = await getBlockedTableIds(
    cafeId,
    reservation.start_time,
    reservation.end_time
  );
  const blockedBySeating = await getSeatedTableIds(cafeId, reservation._id);

  const blockedTableIds = new Set([...blockedBySchedule, ...blockedBySeating]);

  const availableTables = await Table.find({
    cafe_id: cafeId,
    status: 'active',
    is_deleted: false,
    _id: { $nin: Array.from(blockedTableIds) },
  }).exec();

  if (!availableTables || availableTables.length === 0) {
    return null;
  }

  return selectBestFit(availableTables, reservation.party_size);
};
```

Add it to the exports:

```js
module.exports = {
  allocateTables,
  getBlockedTableIds,
  generateMergeCombinations,
  selectBestFit,
  suggestAlternateTable,
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest tests/integration/tableReassignOnConflict.test.js --runInBand
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/allocationEngine.js backend/tests/integration/tableReassignOnConflict.test.js
git commit -m "feat: add suggestAlternateTable for seating-conflict reassignment"
```

---

### Task 4: Let `transitionState` update `table_ids` atomically

**Files:**
- Modify: `backend/src/services/stateMachine.js:55-108`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `transitionState({ ..., tableIdsUpdate })` — new optional param, default `null`. When a non-empty array, sets `table_ids` in the same OCC-guarded `findOneAndUpdate` that writes the status change. All existing callers keep working unchanged.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/integration/tableReassignOnConflict.test.js` (add `const { transitionState } = require('../../src/services/stateMachine');` to the requires):

```js
describe('transitionState tableIdsUpdate', () => {
  test('writes new table_ids in the same update as the status change', async () => {
    const org = await Organization.create({ name: 'Transition Org' });
    const cafe = await Cafe.create({
      org_id: org._id,
      name: 'Transition Cafe',
      slug: 'transition-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });
    const guest = await User.create({
      name: 'Guest',
      email: 'transition@test.com',
      phone: '+1555940001',
      password_hash: 'pass',
    });
    const tableA = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
    const tableB = await Table.create({ cafe_id: cafe._id, table_number: 'B1', capacity: 4 });

    const reservation = await Reservation.create({
      cafe_id: cafe._id,
      user_id: guest._id,
      table_ids: [tableA._id],
      start_time: new Date(Date.now() + 60 * 60 * 1000),
      end_time: new Date(Date.now() + 2 * 60 * 60 * 1000),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'CONFIRMED',
    });

    const updated = await transitionState({
      reservationId: reservation._id,
      tenantId: cafe._id,
      targetStatus: 'SEATED',
      expectedVersion: 0,
      tableIdsUpdate: [tableB._id],
    });

    expect(updated.status).toBe('SEATED');
    expect(updated.table_ids.map((id) => id.toString())).toEqual([tableB._id.toString()]);
  });

  test('leaves table_ids untouched when tableIdsUpdate is omitted', async () => {
    const org = await Organization.create({ name: 'Transition Org 2' });
    const cafe = await Cafe.create({
      org_id: org._id,
      name: 'Transition Cafe 2',
      slug: 'transition-cafe-2',
      timezone: 'UTC',
      subscription_status: 'active',
    });
    const guest = await User.create({
      name: 'Guest',
      email: 'transition2@test.com',
      phone: '+1555940002',
      password_hash: 'pass',
    });
    const tableA = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });

    const reservation = await Reservation.create({
      cafe_id: cafe._id,
      user_id: guest._id,
      table_ids: [tableA._id],
      start_time: new Date(Date.now() + 60 * 60 * 1000),
      end_time: new Date(Date.now() + 2 * 60 * 60 * 1000),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'CONFIRMED',
    });

    const updated = await transitionState({
      reservationId: reservation._id,
      tenantId: cafe._id,
      targetStatus: 'SEATED',
      expectedVersion: 0,
    });

    expect(updated.table_ids.map((id) => id.toString())).toEqual([tableA._id.toString()]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest tests/integration/tableReassignOnConflict.test.js --runInBand
```

Expected: the first new test FAILS — `table_ids` still holds `tableA` because `tableIdsUpdate` is ignored. The second passes already.

- [ ] **Step 3: Implement the parameter**

In `backend/src/services/stateMachine.js`, add `tableIdsUpdate = null,` to the `transitionState` destructured params (after `paymentDataUpdates = null,`):

```js
const transitionState = async ({
  reservationId,
  tenantId,
  targetStatus,
  expectedVersion,
  updatedByUserId = null,
  paymentDataUpdates = null,
  tableIdsUpdate = null,
}) => {
```

Then, immediately after the existing `if (paymentDataUpdates) { ... }` block and before the `// Execute OCC Update` comment, add:

```js
  // Reassigning a party to a different table on seating: folding table_ids
  // into this same OCC-guarded update keeps the table move and the status
  // change atomic for this reservation.
  if (tableIdsUpdate && tableIdsUpdate.length > 0) {
    updateQuery.table_ids = tableIdsUpdate;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest tests/integration/tableReassignOnConflict.test.js --runInBand
```

Expected: PASS (7 tests).

- [ ] **Step 5: Run the payment/state-machine suites to confirm no regression**

```bash
npx jest tests/integration/paymentVerification.test.js tests/integration/webhookIdempotency.test.js tests/integration/occConflict.test.js tests/integration/pendingPaymentExpiry.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/stateMachine.js backend/tests/integration/tableReassignOnConflict.test.js
git commit -m "feat: allow transitionState to atomically update table_ids"
```

---

### Task 5: Include the alternate suggestion in the 409 conflict response

**Files:**
- Modify: `backend/src/controllers/host/reservationController.js:43-108`
- Test: `backend/tests/integration/tableReassignOnConflict.test.js`

**Interfaces:**
- Consumes: `suggestAlternateTable(cafeId, reservation)` (Task 3).
- Produces: the `TABLE_OCCUPIED` 409 body gains an optional `alternate: { tableNumbers: string[], totalCapacity: number }`, present only when a suggestion exists. Also produces the module-private helper `buildOccupancyConflictPayload(cafeId, reservation, conflict)` used again in Task 6.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/integration/tableReassignOnConflict.test.js`. Add these requires at the top of the file: `const request = require('supertest');`, `const jwt = require('jsonwebtoken');`, `const app = require('../../src/app');`, `const config = require('../../src/config/env');`.

```js
describe('PUT /reservations/:resId/status — alternate table suggestion', () => {
  let cafe;
  let hostToken;
  let tableA;
  let tableB;
  let guestA;
  let guestB;

  const putStatus = (reservationId, body) =>
    request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservationId}/status`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send(body);

  const makeRes = (guest, tableIds, status, offsetHours) =>
    Reservation.create({
      cafe_id: cafe._id,
      user_id: guest._id,
      table_ids: tableIds,
      start_time: new Date(Date.now() + offsetHours * 60 * 60 * 1000),
      end_time: new Date(Date.now() + (offsetHours + 1) * 60 * 60 * 1000),
      party_size: 2,
      reservation_timezone: 'UTC',
      status,
    });

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Endpoint Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Endpoint Cafe',
      slug: 'endpoint-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });

    const hostUser = await User.create({
      name: 'Host',
      email: 'host-endpoint@test.com',
      phone: '+1555950001',
      password_hash: 'pass',
      staff_memberships: [
        { cafe_id: cafe._id, role: 'host', permissions: ['edit_reservations', 'cancel_reservations'] },
      ],
    });
    hostToken = jwt.sign({ id: hostUser._id.toString() }, config.JWT_SECRET);

    tableA = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
    tableB = await Table.create({ cafe_id: cafe._id, table_number: 'B1', capacity: 4 });

    guestA = await User.create({
      name: 'Guest A',
      email: 'ga-endpoint@test.com',
      phone: '+1555950002',
      password_hash: 'pass',
    });
    guestB = await User.create({
      name: 'Guest B',
      email: 'gb-endpoint@test.com',
      phone: '+1555950003',
      password_hash: 'pass',
    });
  });

  test('the 409 conflict response suggests a free alternate table', async () => {
    await makeRes(guestA, [tableA._id], 'SEATED', -1);
    const target = await makeRes(guestB, [tableA._id], 'CONFIRMED', 2);

    const res = await putStatus(target._id, { status: 'SEATED', version: 0 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TABLE_OCCUPIED');
    expect(res.body.conflict.guestName).toBe('Guest A');
    expect(res.body.alternate).toEqual({ tableNumbers: ['B1'], totalCapacity: 4 });
  });

  test('omits the alternate when every other table is occupied', async () => {
    const guestC = await User.create({
      name: 'Guest C',
      email: 'gc-endpoint@test.com',
      phone: '+1555950004',
      password_hash: 'pass',
    });
    await makeRes(guestA, [tableA._id], 'SEATED', -1);
    await makeRes(guestC, [tableB._id], 'SEATED', -1);
    const target = await makeRes(guestB, [tableA._id], 'CONFIRMED', 2);

    const res = await putStatus(target._id, { status: 'SEATED', version: 0 });

    expect(res.status).toBe(409);
    expect(res.body.alternate).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest tests/integration/tableReassignOnConflict.test.js --runInBand
```

Expected: the first new test FAILS (`res.body.alternate` is `undefined`, expected the B1 object). The second passes incidentally.

- [ ] **Step 3: Add the payload helper and use it**

In `backend/src/controllers/host/reservationController.js`, add this require below the existing `findSeatedOccupancyConflict` one:

```js
const { suggestAlternateTable } = require('../../services/allocationEngine');
```

Add this helper above `updateReservationStatus`:

```js
/**
 * Builds the 409 body for a seating occupancy conflict, including an
 * auto-suggested free table when one exists so the host can reassign instead
 * of force-seating two parties onto the same table. The `alternate` key is
 * omitted entirely when nothing else fits — the UI hides the option rather
 * than offering a dead end.
 */
const buildOccupancyConflictPayload = async (cafeId, reservation, conflict) => {
  const thisReservationTableIds = new Set(reservation.table_ids.map((id) => id.toString()));
  const sharedTableNumbers = conflict.table_ids
    .filter((t) => thisReservationTableIds.has(t._id.toString()))
    .map((t) => t.table_number);
  const guestName = conflict.user_id?.name || 'Guest';

  const alternate = await suggestAlternateTable(cafeId, reservation);

  return {
    status: 'fail',
    statusCode: 409,
    message: `Table is currently occupied by ${guestName}`,
    error: {
      code: 'TABLE_OCCUPIED',
      message: `Table is currently occupied by ${guestName}`,
    },
    conflict: {
      reservationId: conflict._id,
      guestName,
      tableNumbers: sharedTableNumbers,
      seatedAt: conflict.seated_at,
    },
    ...(alternate && {
      alternate: {
        tableNumbers: alternate.tables.map((t) => t.table_number),
        totalCapacity: alternate.totalCapacity,
      },
    }),
  };
};
```

Then replace the whole `if (conflict) { ... }` block inside `updateReservationStatus` (the one that inlines `sharedTableNumbers`/`guestName` and returns `res.status(409).json({...})`) with:

```js
      if (conflict) {
        return res.status(409).json(
          await buildOccupancyConflictPayload(cafeId, reservation, conflict)
        );
      }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest tests/integration/tableReassignOnConflict.test.js tests/integration/tableOccupancyConflict.test.js --runInBand
```

Expected: PASS. `tableOccupancyConflict.test.js` must stay green — the existing `conflict` fields are unchanged.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/host/reservationController.js backend/tests/integration/tableReassignOnConflict.test.js
git commit -m "feat: suggest a free alternate table in seating-conflict 409s"
```

---

### Task 6: Accept `reassign: true` on the status endpoint

**Files:**
- Modify: `backend/src/controllers/host/reservationController.js` (`updateReservationStatus`)
- Test: `backend/tests/integration/tableReassignOnConflict.test.js`

**Interfaces:**
- Consumes: `buildOccupancyConflictPayload` (Task 5), `suggestAlternateTable` (Task 3), `transitionState({ ..., tableIdsUpdate })` (Task 4).
- Produces: `PUT /api/v1/cafes/:cafeId/reservations/:resId/status` accepts `reassign: boolean` in the body. When `true` and a seating conflict exists, the reservation's `table_ids` are replaced with a freshly-resolved alternate and it is seated there; a fresh 409 is returned if no alternate is available at confirm time.

- [ ] **Step 1: Write the failing test**

Append these tests inside the existing `describe('PUT /reservations/:resId/status — alternate table suggestion', ...)` block from Task 5:

```js
  test('reassign:true seats the party at the suggested table and updates table_ids', async () => {
    await makeRes(guestA, [tableA._id], 'SEATED', -1);
    const target = await makeRes(guestB, [tableA._id], 'CONFIRMED', 2);

    const res = await putStatus(target._id, { status: 'SEATED', version: 0, reassign: true });

    expect(res.status).toBe(200);

    const updated = await Reservation.findById(target._id);
    expect(updated.status).toBe('SEATED');
    expect(updated.table_ids.map((id) => id.toString())).toEqual([tableB._id.toString()]);
  });

  test('reassign:true returns a fresh 409 when the suggested table was taken in the meantime', async () => {
    await makeRes(guestA, [tableA._id], 'SEATED', -1);
    const target = await makeRes(guestB, [tableA._id], 'CONFIRMED', 2);

    // Host is shown B1 as the alternate...
    const first = await putStatus(target._id, { status: 'SEATED', version: 0 });
    expect(first.body.alternate.tableNumbers).toEqual(['B1']);

    // ...but another party takes B1 before the host confirms.
    const guestC = await User.create({
      name: 'Guest C',
      email: 'gc2-endpoint@test.com',
      phone: '+1555950005',
      password_hash: 'pass',
    });
    await makeRes(guestC, [tableB._id], 'SEATED', -1);

    const res = await putStatus(target._id, { status: 'SEATED', version: 0, reassign: true });

    expect(res.status).toBe(409);
    expect(res.body.alternate).toBeUndefined();

    const stillConfirmed = await Reservation.findById(target._id);
    expect(stillConfirmed.status).toBe('CONFIRMED');
  });

  test('reassign:true seats on the original table when the conflict has already cleared', async () => {
    const occupying = await makeRes(guestA, [tableA._id], 'SEATED', -1);
    const target = await makeRes(guestB, [tableA._id], 'CONFIRMED', 2);

    // The occupying party leaves before the host confirms the reassignment.
    await Reservation.updateOne({ _id: occupying._id }, { $set: { status: 'COMPLETED' } });

    const res = await putStatus(target._id, { status: 'SEATED', version: 0, reassign: true });

    expect(res.status).toBe(200);
    const updated = await Reservation.findById(target._id);
    expect(updated.table_ids.map((id) => id.toString())).toEqual([tableA._id.toString()]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest tests/integration/tableReassignOnConflict.test.js --runInBand
```

Expected: `reassign:true seats the party at the suggested table` FAILS with status 409 (the flag is ignored, so it still returns the conflict).

- [ ] **Step 3: Implement the reassign branch**

In `updateReservationStatus`, destructure the new flag:

```js
    const { status, version, force, reassign } = req.body;
```

Replace the entire seating-conflict block (from the `// Seating is the moment...` comment through the closing brace of `if (status === 'SEATED' && !force) { ... }`) with:

```js
    // Seating is the moment a table becomes physically occupied — warn (but
    // don't hard-block, per product decision) if another reservation is
    // already SEATED at a table this one is about to use. From that warning
    // the host can either force through (`force: true`) or move this party to
    // a free table the system picks for them (`reassign: true`).
    let tableIdsUpdate = null;

    if (status === 'SEATED' && !force) {
      const reservation = await Reservation.findOne({ _id: resId, cafe_id: cafeId });
      if (!reservation) {
        throw new NotFoundError('Reservation not found');
      }

      const conflict = await findSeatedOccupancyConflict(cafeId, reservation.table_ids, resId);

      if (conflict) {
        if (!reassign) {
          return res.status(409).json(
            await buildOccupancyConflictPayload(cafeId, reservation, conflict)
          );
        }

        // Re-resolve the alternate at confirm time rather than trusting the
        // one shown in the dialog — another host may have taken it while this
        // one was deciding.
        const alternate = await suggestAlternateTable(cafeId, reservation);
        if (!alternate) {
          return res.status(409).json(
            await buildOccupancyConflictPayload(cafeId, reservation, conflict)
          );
        }

        tableIdsUpdate = alternate.tableIds;
      }
      // No conflict: seat on the originally assigned tables, even when the
      // host asked to reassign — whatever was blocking the table has cleared.
    }
```

Then pass it through to the transition:

```js
    const updatedReservation = await transitionState({
      reservationId: resId,
      tenantId: cafeId,
      targetStatus: status,
      expectedVersion: version,
      updatedByUserId: req.user._id,
      tableIdsUpdate,
    });
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest tests/integration/tableReassignOnConflict.test.js tests/integration/tableOccupancyConflict.test.js --runInBand
```

Expected: PASS (12 + 6 tests).

- [ ] **Step 5: Run the full backend suite**

```bash
npx jest --runInBand
```

Expected: PASS. (Re-run `concurrencyBooking.test.js` alone if it flakes, as noted in Task 1.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/host/reservationController.js backend/tests/integration/tableReassignOnConflict.test.js
git commit -m "feat: accept reassign flag to seat a party at a free table"
```

---

### Task 7: Add the `reassign` flag to the frontend status hook

**Files:**
- Modify: `frontend/src/hooks/host/use-update-status.ts`

**Interfaces:**
- Consumes: the `reassign` body field from Task 6.
- Produces: `UpdateStatusPayload` gains `reassign?: boolean`, forwarded in the PUT body alongside `force`.

- [ ] **Step 1: Add the field**

In `frontend/src/hooks/host/use-update-status.ts`, extend the interface:

```ts
export interface UpdateStatusPayload {
  reservationId: string;
  status: ReservationStatus;
  version: number; // __v token for OCC
  // Bypasses the backend's table-occupancy warning when seating a
  // reservation onto a table another party is currently SEATED at — set
  // after the host confirms an occupancy-conflict dialog.
  force?: boolean;
  // Moves this reservation to a free table the backend picks, instead of
  // force-seating onto the occupied one. Mutually exclusive with `force`.
  reassign?: boolean;
}
```

And thread it through the mutation:

```ts
    mutationFn: async ({ reservationId, status, version, force, reassign }: UpdateStatusPayload) => {
      const { data } = await axiosInstance.put<ApiResponse<Reservation>>(
        `/api/v1/cafes/${cafeId}/reservations/${reservationId}/status`,
        {
          status,
          version,
          force,
          reassign,
        }
      );
      return data.data;
    },
```

- [ ] **Step 2: Type-check**

Run from `frontend/`:

```bash
npx tsc --noEmit
```

Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/host/use-update-status.ts
git commit -m "feat: send reassign flag from the status update hook"
```

---

### Task 8: Build the two-step `SeatingConflictDialog`

**Files:**
- Create: `frontend/src/components/dashboard/seating-conflict-dialog.tsx`
- Test: `frontend/src/components/dashboard/seating-conflict-dialog.test.tsx` (create)

**Interfaces:**
- Consumes: `@/components/ui/dialog` (`Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`) and `@/components/ui/button` (`Button` with `variant` of `'outline' | 'destructive'`), both already used by `frontend/src/components/ui/confirm-dialog.tsx`.
- Produces: `SeatingConflictDialog` component plus exported types `SeatingAlternate` (`{ tableNumbers: string[]; totalCapacity: number }`) and `SeatingConflict` (`{ guestName: string; tableNumbers: string[]; alternate?: SeatingAlternate }`). Props: `{ conflict: SeatingConflict | null; onOpenChange: (open: boolean) => void; onForceSeat: () => void; onReassign: () => void }`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/dashboard/seating-conflict-dialog.test.tsx`:

```tsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { SeatingConflictDialog, SeatingConflict } from './seating-conflict-dialog';

const baseConflict: SeatingConflict = {
  guestName: 'Grace Hopper',
  tableNumbers: ['3'],
};

const renderDialog = (conflict: SeatingConflict | null, overrides = {}) => {
  const props = {
    conflict,
    onOpenChange: vi.fn(),
    onForceSeat: vi.fn(),
    onReassign: vi.fn(),
    ...overrides,
  };
  render(<SeatingConflictDialog {...props} />);
  return props;
};

describe('SeatingConflictDialog', () => {
  test('renders nothing when there is no conflict', () => {
    renderDialog(null);
    expect(screen.queryByText(/already occupied/i)).not.toBeInTheDocument();
  });

  test('shows only Seat Anyway when no alternate table is available', () => {
    renderDialog(baseConflict);

    expect(screen.getByText(/table 3 is already occupied/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /seat anyway/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reassign$/i })).not.toBeInTheDocument();
  });

  test('offers Reassign when an alternate table is available', () => {
    renderDialog({ ...baseConflict, alternate: { tableNumbers: ['7'], totalCapacity: 4 } });

    expect(screen.getByRole('button', { name: /^reassign$/i })).toBeInTheDocument();
  });

  test('Reassign opens a second step naming the table, and Confirm fires onReassign', () => {
    const props = renderDialog({
      ...baseConflict,
      alternate: { tableNumbers: ['7'], totalCapacity: 4 },
    });

    fireEvent.click(screen.getByRole('button', { name: /^reassign$/i }));

    expect(screen.getByText(/move to table 7/i)).toBeInTheDocument();
    expect(screen.getByText(/seats 4/i)).toBeInTheDocument();
    expect(props.onReassign).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
    expect(props.onReassign).toHaveBeenCalledTimes(1);
  });

  test('Back returns from the confirm step to the conflict step', () => {
    renderDialog({ ...baseConflict, alternate: { tableNumbers: ['7'], totalCapacity: 4 } });

    fireEvent.click(screen.getByRole('button', { name: /^reassign$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));

    expect(screen.getByRole('button', { name: /seat anyway/i })).toBeInTheDocument();
  });

  test('Seat Anyway fires onForceSeat', () => {
    const props = renderDialog(baseConflict);

    fireEvent.click(screen.getByRole('button', { name: /seat anyway/i }));
    expect(props.onForceSeat).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `frontend/`:

```bash
npx vitest run src/components/dashboard/seating-conflict-dialog.test.tsx
```

Expected: FAIL — cannot resolve `./seating-conflict-dialog`.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/dashboard/seating-conflict-dialog.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface SeatingAlternate {
  tableNumbers: string[];
  totalCapacity: number;
}

export interface SeatingConflict {
  guestName: string;
  tableNumbers: string[];
  alternate?: SeatingAlternate;
}

interface SeatingConflictDialogProps {
  conflict: SeatingConflict | null;
  onOpenChange: (open: boolean) => void;
  onForceSeat: () => void;
  onReassign: () => void;
}

export function SeatingConflictDialog({
  conflict,
  onOpenChange,
  onForceSeat,
  onReassign,
}: SeatingConflictDialogProps) {
  const [showReassignStep, setShowReassignStep] = useState(false);

  // A fresh conflict — e.g. the suggested table got taken and the backend sent
  // the dialog back — should always land on step 1, never a stale confirm step.
  useEffect(() => {
    setShowReassignStep(false);
  }, [conflict]);

  if (!conflict) return null;

  const occupiedTables = conflict.tableNumbers.join(', ');
  const alternate = conflict.alternate;
  const alternateTables = alternate?.tableNumbers.join(', ');

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-6 rounded-3xl">
        {showReassignStep && alternate ? (
          <>
            <DialogHeader className="text-left">
              <DialogTitle className="font-display text-brand-brown">
                Move to Table {alternateTables}?
              </DialogTitle>
              <DialogDescription className="text-xs text-brand-mocha">
                This reservation will be reassigned to Table {alternateTables} (seats{' '}
                {alternate.totalCapacity}) and seated there.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4 flex-row justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowReassignStep(false)}>
                Back
              </Button>
              <Button type="button" onClick={onReassign}>
                Confirm
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="text-left">
              <DialogTitle className="font-display text-brand-brown">
                Table {occupiedTables} is already occupied
              </DialogTitle>
              <DialogDescription className="text-xs text-brand-mocha">
                {conflict.guestName} is currently seated there.
                {alternate
                  ? ` Table ${alternateTables} is free — you can move this party there instead.`
                  : ' You can seat this party anyway if you know the table is actually free.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4 flex-row justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={onForceSeat}>
                Seat Anyway
              </Button>
              {alternate && (
                <Button type="button" onClick={() => setShowReassignStep(true)}>
                  Reassign
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/components/dashboard/seating-conflict-dialog.test.tsx
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/seating-conflict-dialog.tsx frontend/src/components/dashboard/seating-conflict-dialog.test.tsx
git commit -m "feat: add two-step seating conflict dialog with reassign option"
```

---

### Task 9: Wire the dialog into the reservation drawer

**Files:**
- Modify: `frontend/src/components/dashboard/reservation-drawer.tsx`
- Test: `frontend/src/components/dashboard/reservation-drawer.test.tsx`

**Interfaces:**
- Consumes: `SeatingConflictDialog` and `SeatingConflict` (Task 8), `UpdateStatusPayload.reassign` (Task 7), the `alternate` field on the 409 body (Task 5).
- Produces: no new exports. `handleStatusChange`'s second parameter changes from `force = false` to an options object `{ force?: boolean; reassign?: boolean }`.

- [ ] **Step 1: Write the failing test**

Append these tests to the existing `describe` block in `frontend/src/components/dashboard/reservation-drawer.test.tsx`:

```tsx
  test('offers a Reassign option when the backend suggests a free alternate table', async () => {
    vi.mocked(axiosInstance.put).mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: { code: 'TABLE_OCCUPIED', message: 'occupied' },
          conflict: { reservationId: 'res_other', guestName: 'Grace Hopper', tableNumbers: ['3'], seatedAt: null },
          alternate: { tableNumbers: ['7'], totalCapacity: 4 },
        },
      },
    });

    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: /seat guest at table/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^reassign$/i })).toBeInTheDocument()
    );
  });

  test('hides the Reassign option when the backend suggests no alternate', async () => {
    vi.mocked(axiosInstance.put).mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: { code: 'TABLE_OCCUPIED', message: 'occupied' },
          conflict: { reservationId: 'res_other', guestName: 'Grace Hopper', tableNumbers: ['3'], seatedAt: null },
        },
      },
    });

    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: /seat guest at table/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /seat anyway/i })).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: /^reassign$/i })).not.toBeInTheDocument();
  });

  test('confirming a reassignment retries the seat request with reassign:true', async () => {
    vi.mocked(axiosInstance.put)
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: {
            error: { code: 'TABLE_OCCUPIED', message: 'occupied' },
            conflict: { reservationId: 'res_other', guestName: 'Grace Hopper', tableNumbers: ['3'], seatedAt: null },
            alternate: { tableNumbers: ['7'], totalCapacity: 4 },
          },
        },
      })
      .mockResolvedValueOnce({ data: { data: { ...reservation, status: 'SEATED' } } });

    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: /seat guest at table/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^reassign$/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /^reassign$/i }));

    expect(screen.getByText(/move to table 7/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => expect(axiosInstance.put).toHaveBeenCalledTimes(2));
    expect(vi.mocked(axiosInstance.put).mock.calls[1][1]).toMatchObject({
      status: 'SEATED',
      reassign: true,
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/components/dashboard/reservation-drawer.test.tsx
```

Expected: the three new tests FAIL — no Reassign button is rendered.

- [ ] **Step 3: Update the drawer**

In `frontend/src/components/dashboard/reservation-drawer.tsx`:

Replace the `ConfirmDialog` import with the new dialog, and drop the local `OccupancyConflict` interface in favour of the shared type. Also import `toast`, used below to explain a lost race:

```tsx
import { toast } from 'sonner';
import { SeatingConflictDialog, SeatingConflict } from '@/components/dashboard/seating-conflict-dialog';
```

Delete these lines:

```tsx
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
```

```tsx
interface OccupancyConflict {
  guestName: string;
  tableNumbers: string[];
}
```

Change the state declaration to:

```tsx
  const [occupancyConflict, setOccupancyConflict] = useState<SeatingConflict | null>(null);
```

Replace `handleStatusChange` with:

```tsx
  const handleStatusChange = (
    newStatus: ReservationStatus,
    options: { force?: boolean; reassign?: boolean } = {}
  ) => {
    if (!resId) return;
    updateStatusMutation.mutate(
      {
        reservationId: resId,
        status: newStatus,
        version: res.__v || 0, // OCC version token
        force: options.force ?? false,
        reassign: options.reassign ?? false,
      },
      {
        onSuccess: () => {
          setOccupancyConflict(null);
          closeDrawer();
        },
        onError: (error: any) => {
          const conflict = error?.response?.data?.conflict;
          if (error?.response?.status === 409 && error?.response?.data?.error?.code === 'TABLE_OCCUPIED' && conflict) {
            const alternate = error.response.data.alternate;
            // The host confirmed a move to a specific table and the backend
            // came back with nothing — say so, otherwise the Reassign button
            // silently disappearing reads as a glitch.
            if (options.reassign && !alternate) {
              toast.error('That table was just taken — no free table is available right now.');
            }
            setOccupancyConflict({
              guestName: conflict.guestName,
              tableNumbers: conflict.tableNumbers || [],
              alternate,
            });
          }
        },
      }
    );
  };
```

Update the "Seat Guest at Table" button's handler, which currently passes a bare `false`:

```tsx
                onClick={() => handleStatusChange('SEATED')}
```

Finally, replace the whole `<ConfirmDialog ... />` element at the bottom with:

```tsx
      <SeatingConflictDialog
        conflict={occupancyConflict}
        onOpenChange={(open) => !open && setOccupancyConflict(null)}
        onForceSeat={() => handleStatusChange('SEATED', { force: true })}
        onReassign={() => handleStatusChange('SEATED', { reassign: true })}
      />
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/components/dashboard/reservation-drawer.test.tsx
```

Expected: PASS (5 tests — the 2 pre-existing plus the 3 new).

- [ ] **Step 5: Type-check and run the full frontend suite**

```bash
npx tsc --noEmit
```

Expected: no output.

```bash
npx vitest run
```

Expected: PASS, all suites.

- [ ] **Step 6: Run the full backend suite one last time**

Run from `backend/`:

```bash
npx jest --runInBand
```

Expected: PASS, all suites.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/dashboard/reservation-drawer.tsx frontend/src/components/dashboard/reservation-drawer.test.tsx
git commit -m "feat: offer reassign alongside force-seat on table conflicts"
```
