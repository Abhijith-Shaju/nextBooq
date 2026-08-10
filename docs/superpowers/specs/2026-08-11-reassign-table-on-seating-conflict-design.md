# Reassign Table on Seating Conflict

Date: 2026-08-11
Status: Approved

## Problem

When a host tries to mark a reservation `SEATED` and another party is already
`SEATED` at one of its assigned tables, the current flow (see
`updateReservationStatus` in `backend/src/controllers/host/reservationController.js`
and the conflict dialog in `frontend/src/components/dashboard/reservation-drawer.tsx`)
only offers two choices: cancel, or "Seat Anyway" (`force: true`), which
knowingly double-books the table.

If a different table is physically free right now and big enough for the
party, the host currently has to notice that themselves (by eyeballing the
floorplan) and seat the guest there manually, then fix up the reservation's
table assignment out of band. There is no way to do this through the seating
flow itself.

## Goal

Give the host a third option in the same conflict dialog: **Reassign** the
reservation to a different table (or table combo) that the system has already
confirmed is free, in two steps (see all, confirm, then seat), while keeping
"Seat Anyway" available for cases where the host knows better than the system
(e.g. the "occupied" table is actually free and the data is stale).

## Non-goals

- A general-purpose "move this reservation to another table" action outside
  of the seating-conflict flow. Not requested; can be a follow-up.
- A persisted audit trail of table reassignments beyond the updated
  `table_ids` on the reservation. The existing `status_history` array only
  tracks status transitions, not table changes; we are not extending it in
  this pass.
- Letting the host pick from a list of alternate tables. The system
  auto-suggests exactly one (best-fit single table, else smallest merge
  combo), matching how new bookings are allocated.

## Backend design

### 1. `suggestAlternateTable(cafeId, reservation, session)` — new, `allocationEngine.js`

Finds one alternate table (or merge combo) for `reservation.party_size` that
is free both:

- **by schedule** — not already allocated to another reservation whose
  `[start_time, end_time)` overlaps this reservation's window (reuses the
  existing `getBlockedTableIds`), and
- **in real time** — not currently `SEATED` by any *other* reservation at
  this cafe, regardless of that other reservation's own scheduled window
  (a dinner that's running long still physically occupies the table even
  after its `end_time` has passed — this is exactly why the existing
  `findSeatedOccupancyConflict` check is separate from the schedule-overlap
  check, and the alternate-table search needs to honor both).

Implementation: union the two blocked-table-id sets, fetch active tables not
in that union, and run the same single-fit → merge-fallback selection
`allocateTables` already uses (factor the selection logic out of
`allocateTables` into a shared internal helper so both call it — no behavior
change to `allocateTables` itself).

Returns `{ tableIds, tables, totalCapacity, isMerged }` (same shape
`allocateTables` returns) or `null` if nothing fits.

### 2. `updateReservationStatus` — extended

When a `TABLE_OCCUPIED` conflict is found (existing check, unchanged):

- Also call `suggestAlternateTable`. If it returns a result, include it in
  the 409 payload:
  ```json
  {
    "conflict": { "...": "as today" },
    "alternate": {
      "tableNumbers": ["2"],
      "totalCapacity": 4
    }
  }
  ```
  If `suggestAlternateTable` returns `null`, omit the `alternate` field
  entirely (frontend hides the Reassign option in that case).

New request flag `reassign: true` (sibling to today's `force: true`,
mutually exclusive with it in practice — frontend only ever sends one):

- Skip the conflict check's early return.
- Re-run `suggestAlternateTable` **fresh** at confirm time, to guard against
  the alternate table having been taken between the conflict being shown and
  the host confirming.
- If it still finds a result: pass the new table ids into `transitionState`
  so `table_ids` and the `SEATED` status land in the same atomic
  `findOneAndUpdate` (see concurrency note below).
- If it now returns `null` (lost the race): return a fresh 409
  `TABLE_OCCUPIED` (recomputing the conflict + alternate as in the normal
  path) so the frontend re-shows the dialog with current data instead of
  silently force-seating or erroring opaquely.
- If the conflict has cleared entirely by confirm time (the occupying party
  left), seat on the originally assigned tables — no reassignment needed.

No schema changes. `Reservation.table_ids` already supports being any set of
active tables for the cafe.

### Concurrency note

`transitionState` does **not** use a MongoDB transaction — it guards with
optimistic concurrency on the reservation's own `__v` via a conditional
`findOneAndUpdate`. That protects this reservation from concurrent
modification, and writing `table_ids` in the same update keeps the table
move and the status change atomic *for this document*.

It does not serialize two *different* reservations being reassigned onto the
same free table in the same instant. The re-check immediately before the
write closes the realistic window (host leaves the dialog open for seconds
or minutes while another host takes the table); a genuine sub-millisecond
double-reassign remains possible. Closing that fully would mean threading a
session through `transitionState`, which is also called by the payment
flows — more blast radius than this feature warrants. If it ever matters in
practice, the host still sees the resulting occupancy conflict the next time
they seat, which is the same failure mode as today's force-seat.

## Frontend design

### 1. `use-update-status.ts`

`UpdateStatusPayload` gains `reassign?: boolean`, sent as `{ status, version,
force, reassign }` (only one of `force`/`reassign` ever set to `true` at a
time).

### 2. `reservation-drawer.tsx`

- The 409 handler captures `alternate` alongside the existing `conflict`
  state.
- The conflict UI changes from the current single-purpose `ConfirmDialog`
  ("Seat Anyway" / cancel) to a small two-step custom dialog:
  - **Step 1 (conflict):** "Table {N} is already occupied by {guest}."
    Buttons: **Seat Anyway** (destructive, same as today), **Reassign**
    (primary, only rendered if `alternate` is present), **Cancel**.
  - **Step 2 (confirm reassign, only reachable via Reassign in step 1):**
    "Move this reservation to Table {alternate.tableNumbers} (seats
    {alternate.totalCapacity})?" Buttons: **Confirm** (calls
    `handleStatusChange('SEATED', { reassign: true })`), **Back** (returns
    to step 1).
- On success, the drawer relies on the existing `reservations` query
  invalidation to pick up the new `table_ids` — no bespoke "table changed"
  UI needed; the drawer's table display already reads from
  `getReservationTableNumbers(res)`.
- On a repeat 409 after confirming reassign (lost the race), re-show step 1
  with the freshly returned `conflict`/`alternate` data and a toast noting
  the previous suggestion was taken.

## Testing

- Backend integration test: seed a cafe with 2+ tables, seat one reservation
  on Table A, attempt to seat a second reservation also assigned to Table A
  → expect 409 with `alternate` pointing at Table B. Then retry with
  `reassign: true` → expect 200, `table_ids` updated to Table B, status
  `SEATED`.
- Backend integration test: same setup but every other table is also
  currently `SEATED` or schedule-blocked → expect 409 with no `alternate`
  field.
- Backend integration test: the suggested alternate is taken between the
  conflict being shown and the host confirming → `reassign: true` returns a
  fresh 409 and the reservation stays un-seated. (Deterministic sequential
  version of the race; see the concurrency note above for why the truly
  simultaneous case is out of scope.)
- Backend integration test: the conflict clears before the host confirms →
  `reassign: true` seats on the original tables, `table_ids` unchanged.
- Frontend test: conflict dialog renders Reassign only when `alternate` is
  present; two-step confirm calls the mutation with `reassign: true` and the
  right payload.
