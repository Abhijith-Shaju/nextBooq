# nextBooq — full inspection findings

**Date:** 2026-08-25 · **Commit:** `ee1c018` · **Scope:** 62 backend source files, 154 frontend source files, both dependency trees, plus a live browser session against the running app as a platform admin.

**Tally:** 1 critical · 5 high · 10 medium · 12 low

C-01, M-05 and M-09 were reproduced by executing the affected functions directly; everything else is read from source with file/line references.

**Status (2026-08-25, later same day):** all 6 critical/high findings fixed and committed — see [Fix log](#fix-log) at the end of this document. Medium and low findings are still open.

A rendered version of this report is published as an artifact: https://claude.ai/code/artifact/75e39e7a-c427-4d53-9de2-975076d44690

---

## Critical

### C-01 — One unauthenticated request can issue 666,720 database queries ✅ FIXED

`backend/src/controllers/public/availabilityController.js:25` · `backend/src/utils/operatingHours.js:128`

The public availability endpoint reads `durationMinutes` straight from the query string into `parseInt` with no validation, then passes it to `generateSlotTimes`, whose loop condition is `m + durationMinutes <= closeMinutes`. A negative duration pushes the termination point arbitrarily far out. Every generated slot then runs `allocateTables` — two sequential DB queries plus the merge-combination search.

**Reproduced:** `?durationMinutes=-9999999` turns a normal 24-slot day into **333,360 slots** — ~666,720 sequential queries for a single unauthenticated GET.

The 30/min rate limiter does not help; each request individually can saturate the process. No login required.

**Fix:** validate `durationMinutes` as a positive integer in a sane band (15–480), 400 otherwise; add a slot-count ceiling inside `generateSlotTimes`.

---

## High

### H-01 — A café's webhook secret can confirm another café's reservation ✅ FIXED

`backend/src/controllers/webhookController.js:55`

The handler verifies the HMAC signature against the café named in the URL, then looks up the reservation by order ID alone:

```js
const reservation = await Reservation.findOne({ 'payment_data.order_id': orderId });
```

No `cafe_id` in the filter. Every café holds its own webhook secret, so any café operator can sign a valid webhook for their own slug and drive a state transition on another café's reservation — confirming it as paid without payment.

**Fix:** scope the lookup — `{ 'payment_data.order_id': orderId, cafe_id: cafe._id }`.

### H-02 — A live debug endpoint reflects every request header ✅ FIXED

`backend/src/app.js:61-74`

`app.all('/debug-echo')` echoes `req.headers` in full — including the `cookie` header carrying the session JWT, `authorization`, internal proxy headers, and resolved client IP. It sits above the API router and needs no authentication. Commented in-source as "TEMPORARY … Remove after confirming the issue is resolved."

**Fix:** delete the route, or gate it behind `NODE_ENV === 'development'`.

### H-03 — A manager can redirect the café's payouts to their own account ✅ FIXED

`backend/src/routes/v1/protectedRoutes.js:28` · `backend/src/controllers/admin/cafeController.js:175-200` · `backend/src/models/User.js:25`

Razorpay credentials are written through `PUT /cafes/:cafeId`, gated on `edit_settings` — which the `manager` role gets by default. A manager can replace `razorpay_key_id`/`razorpay_key_secret` with their own and receive every subsequent reservation deposit.

The permission enum already defines `manage_billing` for this. It is declared in the User model and **never checked anywhere in the codebase**.

**Fix:** split the payments block into its own route gated on `manage_billing`; grant that to owners only.

### H-04 — The WebSocket token is a full seven-day session key ✅ FIXED

`backend/src/controllers/authController.js:485-502`

`getSocketToken` calls the same `generateToken` helper as login, hardcoded to `expiresIn: '7d'`. The endpoint's comment describes it as "short-lived-in-practice", but the token is indistinguishable from a session cookie and valid for a week. Unlike the cookie it is deliberately handed to JavaScript, so any XSS or log capture yields a week of full account access.

**Fix:** short TTL (60–120s) plus an audience claim the socket handshake checks and REST auth rejects.

### H-05 — Resetting a password does not end the attacker's session ✅ FIXED

`backend/src/controllers/authController.js:260-302, 205-215`

`resetPassword` rewrites the hash and clears the reset token, but JWTs are stateless and carry only `{ id }`. Tokens minted before the reset stay valid until their 7-day expiry. `logoutUser` likewise clears the cookie client-side and nothing server-side.

This inverts the point of a reset: the usual reason to reset is that someone else has access — and they keep it for up to a week.

**Fix:** add `token_version` to the user, embed in the JWT, bump on reset, compare in `authenticate`.

---

## Medium

### M-01 — Internal error messages returned to clients in production

`backend/src/middleware/errorHandler.js:47-61`

Stack traces are withheld outside development; `message` is not. Whatever the thrown error says is serialised at any status, including 500. Observed live: a CORS rejection returned the full internal message naming the origin and the blocking rule. Mongoose driver errors, decryption failures and SDK messages reach the client the same way.

**Fix:** for `statusCode >= 500` outside development, return a generic message and log the real one.

### M-02 — The unsafe booking path can engage in production on a string match

`backend/src/services/bookingService.js:122-139, 216-232`

`createHoldReservation` falls back to the non-transactional (genuinely racy) path whenever it sees an error whose `message` merely *includes* `'replica set'`, or code 20, or codeName `IllegalOperation`. That detection is meant to identify a standalone dev MongoDB, but nothing restricts it to development and it keys off an error string rather than configuration — so a transient production error carrying that phrase silently downgrades booking to a path that can double-book a table.

**Fix:** detect replica-set support once at startup into config; refuse the fallback entirely when `NODE_ENV === 'production'`.

### M-03 — The host's daily manifest uses UTC day boundaries, not the café's

`backend/src/controllers/host/reservationController.js:16-20`

The window is built as `new Date(\`${date}T00:00:00.000Z\`)` — hardcoded UTC — while every café carries a `timezone` and the booking path converts through it. For an IST café, "today" runs 05:30→05:30, splitting the evening service across two pages. The `date` parameter is also unvalidated: a malformed value yields an Invalid Date and silently returns nothing instead of a 400.

**Fix:** resolve boundaries with `localTimeToUTC` and the café's timezone, as the availability path already does; validate the format.

### M-04 — Nothing guarantees a café keeps an owner

`backend/src/controllers/org/orgController.js:83-169` · `backend/src/services/orgOwnershipService.js:9-33`

Org ownership is derived: a user owns an org when they hold `owner` on every non-deleted café in it. `postAssignStaff` can grant `owner`; `deleteStaff` only refuses to remove *yourself*. So:

- An owner can promote a second user to owner, who can then remove the first — a complete org takeover.
- Removing the last owner-role membership leaves a café nobody owns. `getOwnedOrgId` then returns null for everyone and the org's whole management surface becomes unreachable.

**Fix:** refuse any change dropping a café to zero owners; require an explicit transfer flow for owner-to-owner demotion.

### M-05 — Deleting a reused table number fails with a duplicate-key error

`backend/src/models/Table.js:53`

The unique index is `{ cafe_id, table_number, is_deleted }`. Including the soft-delete flag permits reuse after deletion, but also permits two *deleted* rows to collide.

**Sequence:** create table 5 → soft-delete → create table 5 again → soft-delete again. The second delete writes a second `{cafe, 5, is_deleted: true}` row; MongoDB rejects it with E11000, surfacing as a confusing 409.

**Fix:** make the index partial on live rows — unique over `{ cafe_id, table_number }` with `partialFilterExpression: { is_deleted: false }`.

### M-06 — A table can be deleted out from under live reservations

`backend/src/controllers/admin/tableController.js:206-215`

`assertCapacityReductionIsSafe` blocks a capacity change that would strand a booked party, but setting `is_deleted: true` runs no equivalent check. Confirmed reservations keep pointing at a table the allocation engine filters out and the floorplan no longer draws.

**Fix:** apply the same active-reservation guard to deletion, or require reassignment first.

### M-07 — Checkout promises a refund the system cannot issue

`frontend/src/components/booking/checkout-card.tsx:97,109` · `backend/src/controllers/webhookController.js:91`

The checkout card labels the deposit "refundable" and says it is "held by Razorpay and adjusted against your bill at the café." There is no refund code anywhere in the backend. The only related artefact is a `requires_manual_refund` boolean the webhook sets when payment lands on an already-terminal reservation — and nothing reads it: no endpoint, no admin screen, no report. Its only companion is a `console.warn`.

A customer charged for a reservation that expired mid-payment is owed money that exists only in server logs. This has a consumer-terms dimension, not just a functional one.

**Fix:** surface flagged reservations in the platform-admin area at minimum; implement refunds via the Razorpay API or soften the checkout copy.

### M-08 — Hold expiry depends on an in-process timer

`backend/server.js:22-36`

Both sweeps run from `setInterval` inside the API process. On a serverless or scale-to-zero host the interval does not reliably run, and abandoned holds then block their tables permanently (`PENDING_PAYMENT` is unconditionally blocking). Across replicas, every instance runs the same sweep, multiplying work and OCC conflicts. The `/debug-echo` comment referencing "Vercel proxy requests" suggests a serverless target is in play.

**Fix:** move to an external scheduler hitting an authenticated endpoint, or take a database lock so exactly one instance sweeps.

### M-09 — Cafés that close after midnight cannot be configured

`backend/src/utils/operatingHours.js:120-135, 176` · `backend/src/controllers/admin/cafeController.js:71`

Three layers disagree. `generateSlotTimes` handles overnight hours deliberately, rolling closing forward 24h. `validateOperatingHours` does not apply the same roll. The settings validator rejects `close_time <= open_time` outright, so the case cannot be entered at all.

**Reproduced:** for a café open 18:00–02:00, `generateSlotTimes` offers 13 bookable slots while `validateOperatingHours` rejects a 20:00–22:00 booking as "exceeds cafe closing time (02:00)". Every offered slot would fail at booking.

Bars and late-night restaurants — a core segment — cannot be onboarded, and dead code in the slot generator masks it.

**Fix:** apply the 24h roll in `validateOperatingHours`, then allow overnight ranges in the settings validator.

### M-10 — Four high-severity advisories in frontend dependencies

`frontend/package.json`

`npm audit` reports four highs, all reached through the pinned Next.js version: `postcss` (arbitrary file read and path traversal via attacker-controlled `sourceMappingURL`, plus XSS in stringify output) and `sharp` (inherited libvips CVEs). The backend is clean — zero advisories.

**Fix:** plan the Next.js major upgrade deliberately rather than `--force`.

---

## Low

| ID | Finding | Location |
|----|---------|----------|
| L-01 | No `error.tsx`, `global-error.tsx` or `loading.tsx` in any of the 19 routes — a render throw falls through to a blank screen with no recovery | `frontend/src/app/` |
| L-02 | Zustand booking store has no persistence; refreshing `/[tenant]/checkout` renders em-dashes and a permanently disabled Pay button, with no path back to the live hold | `store/use-booking-store.ts:37` |
| L-03 | If `verify-payment` fails after Razorpay took the money, the user gets a toast and stays put — no payment reference shown, no retry, nothing to quote to the café | `booking/checkout-card.tsx:55-58` |
| L-04 | Availability search awaits each slot in turn, 2 queries each — 52+ serial round trips for a 30-min turn time across a 13-hour day | `availabilityController.js:103-129` |
| L-05 | `generateMergeCombinations` enumerates all table triples with a graph traversal per candidate — ~161,700 combinations per call at 100 tables | `allocationEngine.js:43-101` |
| L-06 | Registration returns distinct messages for an existing email vs phone, enumerating both — inconsistent with the carefully non-enumerable `forgotPassword` | `authController.js:71,76` |
| L-07 | The axios interceptor toasts on every non-401 error and several call sites add their own, so some failures raise two toasts | `axios-instance.ts:79-86` |
| L-08 | Admin table rows have `onClick` but no `tabIndex`/key handler; the subscription drawer is a modal with no `role="dialog"`, focus trap or Escape; one `<img>` lacks `alt` | `admin/page.tsx`, `subscription-drawer.tsx:60`, `storefront-editor.tsx:113` |
| L-09 | `getCustomerReservations` returns a guest's entire history with two populates and no limit; `getDailyManifest` with no `date` returns every reservation ever | `customerController.js:8`, `reservationController.js:23` |
| L-10 | Key-secret selection uses `process.env.NODE_ENV` while the rest of the file uses validated `config`; an unconfigured café outside dev hits `decrypt('')` and 500s instead of returning a clear 400 | `paymentService.js:156-160` |
| L-11 | `logAuditEvent` swallows every error into `console.error` — a persistently failing audit write produces no alert and leaves gaps in the login-failure/rate-limit record | `auditService.js:25-27` |
| L-12 | Untested behavioural components: `customer-auth-modal`, `payment-card`, `auth-overlay`, `email-verification-banner` (coverage is otherwise strong at 65 backend + 67 frontend test files) | `frontend/src/components/` |

---

## What holds up well

Most of this codebase is careful, and several findings above are narrow gaps in otherwise deliberate designs.

- **Credential encryption** is textbook AES-256-GCM with random IV and auth tag; the Cafe model redacts secrets in both `toJSON` and `toObject` as defence in depth.
- **Signature verification** uses `timingSafeEqual` with a length pre-check in both webhook and checkout paths, and verifies against captured raw bytes rather than a re-serialised body.
- **Multi-tenant scoping** is consistent — nearly every query carries `cafe_id`. H-01 stands out precisely because it is the exception.
- **The reservation state machine** has an explicit transition matrix and optimistic concurrency on every write.
- **Booking amounts** are always derived server-side from the café's configured fee; no client-supplied amount is trusted anywhere.
- **Rate limiting** is applied thoughtfully, with comments explaining the specific abuse each limiter prevents.
- **NoSQL injection** is closed off globally by stripping `$` and dotted keys from all request input.
- **Environment validation** refuses to boot production with published placeholder secrets. The codebase carries exactly one TODO, no `dangerouslySetInnerHTML`, and one stray `console.log`.

---

## Suggested order

1. **C-01, H-02** — one-line changes with disproportionate payoff: validate a query parameter, delete a debug route.
2. **H-01, H-03** — the money and tenancy path. Both are small diffs; both currently let one café's actor reach another café's money.
3. **H-04, H-05** — session integrity. A version claim in the JWT solves both.
4. **M-02, M-03, M-07** — data integrity, daily operations, and the consumer-terms exposure respectively.

---

## Fix log

All 6 critical/high findings fixed the same day, each with a regression test proving the exploit and proving the fix, verified against the full backend (429/429) and frontend (360/360) suites:

| Finding | Commit | Notes |
|---------|--------|-------|
| C-01 | `c6bccbd` | Bounded `durationMinutes` to [15, 720] minutes on the public availability endpoint. |
| H-01 | `fb12a30` | Scoped the webhook's reservation lookup to the verified café (`cafe_id` added to the query). |
| H-02 | `5c0fb5d` | Deleted `/debug-echo` entirely. |
| H-03 | `c9dd055` | Split payment credentials into `PUT /cafes/:cafeId/payments`, gated on `manage_billing` instead of `edit_settings`. |
| H-04 | `4ca4c8e` | Socket tokens now expire in 120s and carry an `aud: 'socket'` claim, checked in both directions (socket handshake requires it; REST auth rejects it). |
| H-05 | `4ca4c8e` | Added `User.token_version`, embedded as `tv` in every session token and bumped on password reset; `authenticate` rejects a stale `tv`. Logout deliberately left as-is (device-local), since only a reset — not an ordinary logout — should revoke every session. |

Two full-suite runs during H-04/H-05 verification surfaced intermittent failures in `tableAssignment.test.js` and `reservationFeeCharging.test.js`; both were confirmed pre-existing test-order flakiness (reproduced identically with the fix commits reverted, and passed cleanly in isolation), not regressions.

Medium and low findings remain open.

---

## Fix log, part 2 — medium and low findings

Continued the same day. Each fix below has a regression test; full suites verified clean after each (backend 80/80, frontend 68/68 as of the last run in this pass).

| Finding | Commit | Notes |
|---------|--------|-------|
| M-01 | `adfa3d8` | 500 responses outside development now return a generic message; the real one is logged server-side. 4xx messages unchanged. |
| M-02 | `5579b48` | The non-transactional booking fallback now refuses to engage when `NODE_ENV === 'production'`, regardless of the error shape. |
| M-03 | `70db9c3` | Daily manifest's day window now resolves in the café's own timezone via `localTimeToUTC`, matching the availability path. Malformed `date` now 400s. |
| M-04 | `73e9829` | **Reviewed, not reproducible** — traced why: the caller can never modify their own membership, and `requireOrgOwner` requires owning every café in the org, so a café can't be left with zero owners through these endpoints. Added regression tests proving it rather than leaving it as an assumption. No code change. |
| M-05 | `927d5ec` | Table `table_number` unique index made partial (`is_deleted: false` only) — a deleted table_number can no longer collide with itself on reuse. |
| M-06 | `ac38420` | Deleting a table now checks for an active reservation still assigned to it, mirroring the existing capacity-reduction guard. |
| M-07 | `9ca25bb` | New `GET /platform-admin/refunds-needed` endpoint plus a warning banner on the admin overview page, listing reservations flagged `requires_manual_refund`. Full Razorpay refund automation is out of scope — this is the "someone actually sees it" minimum. |
| M-08 | `b6a5ce5`, `5a6d74b` | Background sweeps (stale holds/pending payments, subscription expiry) now guarded by a Mongo-backed distributed lock so multiple API instances don't multiply the work. Second commit fixed a race in the lock's own upsert, caught by an intermittent full-suite failure. Does not address a sweep not running at all on a serverless/scale-to-zero host — that's a deployment decision, not a code fix. |
| M-09 | `5a6d74b` | `validateOperatingHours` now rolls an overnight schedule's closing time forward by 24h, matching `generateSlotTimes`; the settings validator now accepts `close_time < open_time` as a legitimate overnight schedule (only identical open/close is still rejected). Left the deeper "which day's schedule applies after midnight" lookup ambiguity out of scope. |
| M-10 | — | Deliberately deferred — fixing the four `postcss`/`sharp` advisories requires a major Next.js version bump, which needs its own planned upgrade rather than a reflexive `--force`. |
| L-06 | `f08ff04` | Registration now returns one generic message for either an existing email or existing phone, instead of two distinguishable ones. |
| L-07 | `cfd8364` | Added a `skipGlobalErrorToast` request-config opt-out for the axios error interceptor; applied it to the one call site with a verified double-toast (resend-verification-email). The other 15 call sites flagged in the original finding need individual review — out of scope for this pass. |
| L-08 | `6e106a5` | Admin table rows are now keyboard-operable (`tabIndex`, Enter/Space, focus ring); the subscription drawer now has `role="dialog"`, `aria-modal`, an accessible name, and closes on Escape. The `<img>` and second-missing-alt claims in the original finding didn't hold on inspection — corrected, no change needed there. |
| L-09 | `be9b262` | Daily manifest with no `date` now defaults to the café's own "today" instead of every reservation ever; `GET /customer/reservations` capped at 200. Also fixed a time-of-day-dependent flaky test in the M-02 commit, caught while regression-testing this fix. |
| L-10 | `f08ff04` | `verifyCheckoutPayment` now reads `config.NODE_ENV` instead of `process.env.NODE_ENV` directly; an unconfigured café outside development now gets a clear 400 instead of an unhandled 500 from `decrypt('')`. |
| L-11 | `a9c65be` | Added an in-memory consecutive-failure counter for audit-log writes, surfaced as `checks.auditLog` on `/health` (status code stays 200 regardless — audit logging is deliberately off the critical path). |
| L-01, L-02, L-03, L-04, L-05, L-12 | — | Not attempted in this pass — these are feature-sized work (route-level error/loading boundaries across ~8 groups; booking-store persistence and a redirect-when-empty flow; a payment-verification retry/status UX; two performance refactors in booking-critical paths; new test suites for 4 components), not bounded bug fixes. Flagged for a separate pass. |

Two items corrected on inspection rather than "fixed": M-04's zero-owner scenario turned out not to be reachable (verified with a test), and two of L-08's sub-claims (missing `alt`, a second untagged image) didn't hold either.
