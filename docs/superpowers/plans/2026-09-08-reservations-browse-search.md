# Reservations Browse, Search and Pagination Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Not started. Deferred deliberately — the site was launch-ready without it (8 September 2026) and this is too large to bolt on beside a launch.

**Goal:** Turn the café's reservations page from "pick a day, see that day" into a browsable list of all reservations, nearest first, with server-side search, pagination, and a visible day boundary between dates.

**Architecture:** A **new** endpoint alongside the existing host-stand manifest, never a change to it. The manifest returns one café-local day in full and the floor view depends on that; paginating it would silently truncate a busy service. Search moves server-side, which requires the three things staff search by — guest name, phone, and the reservation token — to be present on the reservation document itself, because today two live on the `User` and the third is derived from `_id` at render time. So they get denormalised and indexed, and a backfill fills them for existing rows.

**Tech Stack:** Backend — Node/Express 5, Mongoose 9, Jest + supertest. Frontend — Next.js App Router, TypeScript, TanStack Query, Vitest.

---

## Decisions to confirm before starting

Both were raised and not settled. The plan assumes the recommended answer; changing either changes Task 2 and Task 3.

1. **Does the list include past reservations?** *Assumed: yes* — one list, upcoming first (ascending from now), then past descending, so "nearest to furthest" reads outward from today in both directions. If past bookings are excluded instead, Task 2 loses the two-direction merge and gets noticeably simpler.
2. **Must search still find a booking by its 4-character token?** *Assumed: yes* — staff use it because it is what the guest reads off their phone. If dropped, **Task 1 disappears entirely** and search becomes a `$lookup` on name/phone only. This is the single biggest lever on the size of this work.

---

## Global Constraints

- **Do not modify `GET /api/v1/cafes/:cafeId/reservations`.** It is the host-stand manifest and it is consumed by *two* pages — `frontend/src/app/[tenant]/(dashboard)/dashboard/page.tsx` (the live floor view, `staleTime: 0`) and the reservations page being changed here. Adding pagination or changing its sort would make the floor view show a partial service **with no error visible to the host**. That is the one genuinely dangerous change available in this area.
- `frontend/src/hooks/host/use-manifest.ts` stays as it is. The new page uses a new hook.
- `matchesReservationSearch` in `frontend/src/lib/dashboard/reservation-search.ts` stays as it is — the host stand still filters one loaded day client-side and that is correct there. It also documents the parity target: name, email, phone-as-digits, and token.
- **Search must not regress.** Today staff can find a booking by token, guest name, email, or phone within a day. After this change they must be able to find it by all four across all dates. Fewer fields searchable than today is a regression, not a trade.
- **A stored token must equal the displayed one.** `getReservationToken` is `String(_id).slice(-4).toUpperCase()`. If Task 1 stores anything else, staff hunt for a token the guest is not holding — the exact failure the existing comment in `reservation-token.ts` warns about.
- **Day grouping uses the café's timezone, not the browser's.** The page currently formats with `date-fns` on browser time. Grouping by day that way puts the boundary in the wrong place for anyone whose browser is not on café time. Use the café's `timezone` and the existing `getLocalTimeDetails` / `formatLocalDateTime` in `backend/src/utils/operatingHours.js` as the reference for how this app does it, or compute the date key server-side and send it.
- Existing indexes on `Reservation` (`backend/src/models/Reservation.js`): `{cafe_id, status, start_time, end_time}`, `{payment_data.order_id}`, `{status, payment_data.expires_at}`, `{cafe_id, start_time: -1}`, `{user_id, created_at: -1}`. The `{cafe_id, start_time}` index serves either sort direction; do not add a duplicate ascending one.
- Stale `HOLD` rows must be excluded the same way the manifest does it: `$or: [{status: {$ne: 'HOLD'}}, {hold_expires_at: {$gt: new Date()}}]`. A hold that expired but has not been swept is not a booking anyone should browse.
- Permission is `view_reservations`, matching the manifest.
- Backend tests: `cd backend && npx jest <path> --runInBand`. Frontend: `cd frontend && npx vitest run <path>`, plus `npx tsc --noEmit` and `npx next lint`.
- **The backend has no ESLint config.** Do not run `npm run lint` there and do not create one.

---

### Task 1: Denormalise the searchable fields onto the reservation

Skip this task entirely if decision 2 above comes back as "token search not needed" — in that case a `$lookup` on the user covers name and phone and this task is wasted work.

**Files:**
- Modify: `backend/src/models/Reservation.js`
- Modify: `backend/src/services/bookingService.js` (both construction sites — transactional and fallback)
- Create: `backend/scripts/backfillReservationSearchFields.js`
- Test: `backend/tests/integration/reservationSearchFields.test.js`

**Interfaces:**
- Produces: every reservation carries `token`, `guest_name_lower`, `guest_phone_digits`, indexed. Task 2 queries these and nothing else.

- [ ] **Step 1: Write the failing tests** — a new booking gets a `token` equal to the last 4 characters of its `_id` uppercased; `guest_name_lower` is the booking user's name lowercased; `guest_phone_digits` strips non-digits. Assert the token matches what `getReservationToken` would produce for the same id, so the two derivations cannot drift.
- [ ] **Step 2: Add the fields** to `reservationSchema` and an index. `{cafe_id: 1, token: 1}` and `{cafe_id: 1, guest_name_lower: 1}`; phone can share the name index's prefix or take its own — measure rather than guess.
- [ ] **Step 3: Populate them on write.** `token` cannot be set before `_id` exists, so derive it in a `pre('save')` / post-insert step, or generate the `ObjectId` explicitly before constructing the document. The second is simpler and keeps it inside the existing transaction.
- [ ] **Step 4: Backfill script** for existing rows, modelled on `backend/scripts/backfillTableZoneFloor.js`. Idempotent, logs a count, and safe to re-run.
- [ ] **Step 5: Run the backfill against local, verify a spot-check row, then run the tests.**

---

### Task 2: The browse endpoint

**Files:**
- Modify: `backend/src/controllers/host/reservationController.js`
- Modify: `backend/src/routes/v1/protectedRoutes.js`
- Test: `backend/tests/integration/reservationBrowse.test.js`

**Interfaces:**
- Consumes: the fields from Task 1.
- Produces: `GET /api/v1/cafes/:cafeId/reservations/browse?q=&page=&limit=&status=` returning `{ data, page, limit, total, has_more }`. Task 3 consumes exactly this shape.

- [ ] **Step 1: Write the failing tests.** Cover: ordering nearest-first; a page boundary returning the right slice and an accurate `total`; search finding a booking by token, by partial guest name, by phone typed with spaces and `+91`; a stale `HOLD` excluded; `view_reservations` required; and a café only ever seeing its own reservations. That last one is the tenancy test — assert a second café's booking is absent, not merely that the first café's is present.
- [ ] **Step 2: Implement the handler.** Reuse `attachGuestHistory` — it is one query per page, which is cheaper here than it is for the manifest.
- [ ] **Step 3: Wire the route** *above* the `/:resId` routes if the path could collide; `/reservations/browse` would otherwise be read as `resId: 'browse'`. Verify by hitting it.
- [ ] **Step 4: Confirm the query uses an index** — `.explain('executionStats')` on the search path, and check `totalDocsExamined` is not the whole collection.

---

### Task 3: The page

**Files:**
- Create: `frontend/src/hooks/host/use-reservation-browse.ts`
- Modify: `frontend/src/app/[tenant]/(dashboard)/reservations/page.tsx`
- Test: `frontend/src/app/[tenant]/(dashboard)/reservations/page.test.tsx` (extend)

**Interfaces:**
- Consumes: the endpoint from Task 2.

- [ ] **Step 1: Write the failing tests.** A day separator appears between two bookings on different café-local days and *not* between two on the same day; a page whose first row is mid-day still shows that day's separator at the top; pagination controls disable at the ends; searching calls the endpoint with `q` rather than filtering in the browser; and the empty state distinguishes "no reservations" from "nothing matched your search".
- [ ] **Step 2: Add the hook**, `keepPreviousData` so the list does not blank between pages, and debounce `q` so typing does not fire a request per keystroke.
- [ ] **Step 3: Rebuild the list** with the separator. Group by café-local date key — see the timezone constraint above.
- [ ] **Step 4: Remove the date picker and the client-side filter** from this page only. `matchesReservationSearch` stays for the host stand.

---

### Task 4: Tidy up

- [ ] Check whether `frontend/src/lib/dashboard/reservation-search.ts` still has a consumer. If the host stand is its only caller, say so in its docstring so the next reader does not assume the reservations page uses it too.
- [ ] `legal/CONFLICTS-vs-codebase.md` is a stale audit snapshot from 5 September and several entries have since been fixed. Unrelated to this work, but worth deleting or re-running while in the area.

---

## Self-Review

- [ ] The manifest endpoint is byte-for-byte unchanged, and `/dashboard` still shows a full day.
- [ ] Search finds a booking by token, name, email and phone — the same four as before, now across all dates.
- [ ] A stored token matches `getReservationToken` for the same reservation.
- [ ] Day separators fall in the right place for a café whose timezone differs from the browser's.
- [ ] `explain` shows the search path using an index.
- [ ] One café cannot see another's reservations through the new endpoint.
- [ ] Backend: `npx jest --runInBand` fully green. Frontend: `npx vitest run`, `npx tsc --noEmit`, `npx next lint` all clean.
