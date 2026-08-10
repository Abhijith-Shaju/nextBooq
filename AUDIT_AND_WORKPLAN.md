# nextBooq — Security & Functional Audit + Work Plan

Audit date: 2026-08-09. Scope: full backend (`backend/src`) and frontend (`frontend/src`), read-only. Findings are grouped by severity, with file:line references. Fix order follows severity, then blast radius (payments/tenant-isolation before cosmetic issues).

> ⚠️ **Note found during audit**: `frontend/AGENTS.md` contained text instructing an agent to read docs from a nonexistent `node_modules/next/dist/docs/` path, framed as an authoritative auto-generated instruction — a prompt-injection pattern. Removed on 2026-08-10, along with `frontend/CLAUDE.md` which only imported it.

> ✅ **Status (2026-08-10)**: All P0, P1, P2, and P3 items below are resolved — either fixed and TDD'd, or explicitly reviewed and closed with reasoning (see notes on #26 and #40). Backend 33/33 suites (148 tests), frontend 29/29 suites (113 tests), clean `tsc --noEmit`, clean production build. Nothing outstanding from this audit.

---

## P0 — Critical (fix immediately, before any other work)

These break payments, cause double-bookings, or leak cross-tenant data.

1. **Razorpay webhook signature verification is broken and will reject all real webhooks.**
   `backend/src/controllers/webhookController.js:16-22`, `backend/src/app.js:20,22`
   HMAC is computed over `JSON.stringify(req.body)` (re-serialized/sanitized) instead of the raw bytes Razorpay signed. Every legitimate webhook fails verification → `PENDING_PAYMENT → CONFIRMED` never fires in production.
   **Fix**: capture raw body via `express.json({ verify: (req,res,buf) => { req.rawBody = buf } })`, exempt the webhook route from `sanitizeInput`, HMAC over `req.rawBody`. Also switch the comparison to `crypto.timingSafeEqual` (currently a plain `!==`, timing side-channel).

2. **Frontend never verifies payment with the backend — fake "success" is reachable.**
   `frontend/src/components/booking/checkout-card.tsx:19-40`
   Razorpay's client-side `handler` callback directly shows "Payment verified" and redirects to `/success` with no POST of `razorpay_payment_id`/`order_id`/`signature` to the backend anywhere in the frontend.
   **Fix**: add a `/reservations/:id/verify-payment` call from the frontend after the Razorpay handler fires; only show success once the backend confirms signature verification server-side (ties into #1).

3. **Checkout opens Razorpay with a fabricated fake order ID.**
   `frontend/src/components/booking/checkout-card.tsx:27` + root cause `frontend/src/hooks/public/use-book-table.ts:26-46`
   `setReservation` is destructured but never called in `onSuccess`, so the booking store's `reservation` is always `null`, so checkout falls back to `order_id: 'order_' + Math.random()...`.
   **Fix**: call `setReservation(data)` in `onSuccess`; block checkout entirely until a real hold/order is loaded from the backend.

4. **`PENDING_PAYMENT` reservations never expire — abandoned checkouts permanently lock tables.**
   `backend/src/services/stateMachine.js:6-7`, `backend/src/services/allocationEngine.js:13-19`, `backend/src/services/bookingService.js:16-22`
   No cron/scheduled sweep exists anywhere in `src/`. Combined with #1, this is actively happening today.
   **Fix**: add a scheduled job expiring `PENDING_PAYMENT` reservations past a timeout (mirror `hold_expires_at` pattern used for `HOLD`).

5. **Double-booking race condition on non-replica-set MongoDB deployments.**
   `backend/src/services/bookingService.js:38-98` (`createHoldReservationNonTransactional`)
   No locking/atomicity — two concurrent requests can both pass availability checks before either writes. Invisible in CI because `tests/setup.js:24-26` always spins up a replica set.
   **Fix**: add a unique/partial index or `findOneAndUpdate`-based table lock in the fallback path, or refuse booking traffic without a replica set (make the requirement explicit in deploy docs).

6. **Deleting/disabling a table doesn't touch its existing reservations.**
   `backend/src/controllers/admin/tableController.js:94-166`
   Setting `is_deleted`/`out_of_service` never checks or reassigns active future reservations bound to that table. A guest can show up to a table that no longer exists.
   **Fix**: before allowing the status change, query active future reservations referencing the table; block, reassign, or notify staff.

7. **Unauthenticated cross-tenant WebSocket room join (IDOR).**
   `backend/src/services/socketService.js:16-22`
   Any client can `join_cafe_room` with an arbitrary `cafeId` and receive another tenant's live reservation events.
   **Fix**: authenticate the socket connection (verify JWT on `connection`) and only allow joining a room if the user has staff membership for that `cafe_id`.

8. **CORS reflects any origin with credentials enabled.**
   `backend/src/app.js:13-18`
   `callback(null, origin || true)` with `credentials: true` disables CORS's origin protection.
   **Fix**: replace with an explicit allow-list of trusted frontend origins.

---

## P1 — High (fix this sprint)

9. **JWT stored in both `localStorage` and a JS-writable cookie — one XSS = full account takeover.**
   `frontend/src/lib/session.ts:10-26`
   **Fix**: move to a backend-set `httpOnly`, `Secure`, `SameSite=Strict` cookie; stop mirroring the token into `localStorage`.

10. **Staff and customer sessions share the same storage key — concurrent tabs stomp each other's login.**
    `frontend/src/lib/session.ts:4`, `use-login.ts`, `use-customer-quick-auth.ts`
    **Fix**: use distinct storage keys/cookies per session type.

11. **No client-side (or confirmed server-side) check that the logged-in user actually belongs to the tenant in the URL.**
    `frontend/src/app/[tenant]/(dashboard)/dashboard/page.tsx:17-18`, `settings/page.tsx:31`, all `hooks/host/*`/`hooks/admin/*`, `route-guard.ts`
    Route guard only checks "is there a valid session," not tenant membership. **Needs backend verification** — confirm every admin/host controller independently checks the authenticated user's cafe membership against the `cafeId`/tenant param (cross-reference with finding below).
    **Fix**: add explicit tenant-membership checks server-side on every protected route (defense in depth), and client-side redirect/hide when `user`'s cafe membership doesn't match the URL tenant.

12. **RBAC: `cancel_reservations` permission is defined but never checked; `edit_reservations` gates everything instead.**
    `backend/src/routes/v1/protectedRoutes.js:42-47`, `backend/src/models/User.js:24`
    **Fix**: check `cancel_reservations` specifically when `targetStatus === 'CANCELLED'`, or remove the unused permission from the schema.

13. **Table capacity edits aren't validated against existing reservations relying on the old capacity.**
    `backend/src/controllers/admin/tableController.js:108`
    A party of 8 can silently end up on a table now configured for capacity 2.
    **Fix**: reject (or warn/force-confirm) capacity reductions that would leave active reservations over-capacity.

14. **`CafeCustomer.total_visits`/`total_no_shows` are defined but never incremented — any repeat-customer/no-show logic is dead.**
    `backend/src/models/CafeCustomer.js:15-22`
    **Fix**: increment on `SEATED → COMPLETED` and `CONFIRMED → NO_SHOW` in `stateMachine.js`.

15. **Query param name mismatch breaks "Complete Payment" for returning customers.**
    `frontend/src/app/[tenant]/my-reservations/page.tsx:120` (`?reservationId=`) vs `use-book-table.ts:43` (`?reservation_id=`) vs `CheckoutCard` (reads neither — only the Zustand store).
    **Fix**: standardize on one param name, and have checkout hydrate the store from the URL param if the store is empty (handles page refresh/deep link too).

16. **Dashboard's two primary click targets (manifest rows, floorplan tables) are unreachable by keyboard.**
    `frontend/src/components/dashboard/manifest-table.tsx:43`, `floorplan-canvas.tsx:55`
    Clickable `<div>`s with no role/keyboard handling.
    **Fix**: use `<button>` or add `role="button"` + `tabIndex`/`onKeyDown`.

17. **No rate limiting on `/available-slots` (unauthenticated, CPU-expensive) or reservation creation.**
    `backend/src/routes/v1/publicRoutes.js:18,21-27`
    Allocation engine does combinatorial backtracking per slot — cheap DoS amplification vector; unlimited HOLD creation lets an attacker squat inventory.
    **Fix**: apply the existing rate limiter middleware to these routes.

---

## P2 — Medium (fix next sprint / before next major release)

18. **Webhook route: signature check aside, also fix the "captured raw body" plumbing consistently** — bundled with #1, listed separately only if #1 is split into two PRs.

19. **`trust proxy` not configured** — collapses all clients to one IP for rate limiting/audit logs behind a reverse proxy. `backend/src/app.js`. Fix: `app.set('trust proxy', 1)` matching deploy topology.

20. **No password strength requirement on registration/quick-auth.** `backend/src/controllers/authController.js:14-25,182-193`. Fix: enforce min length via schema validation.

21. **`updateCafe` isn't gated by subscription enforcement while table writes are — inconsistent billing gate.** `backend/src/routes/v1/protectedRoutes.js:26-31` vs `:57-71`. Confirm intent; add `enforceSubscriptionForWrite` if settings should also be gated.

22. **Expired `HOLD` reservations never flip to `EXPIRED` and pollute the host's daily manifest.** `stateMachine.js:6`, `host/reservationController.js:20-26` (`getDailyManifest` has no status/expiry filter). Fix: background sweep + filter manifest query (can share the same scheduled job as #4).

23. **Socket room join has no server-side tenant check visible from the client** — same root cause as #7/#11, listed here for the dashboard layout call site. `frontend/src/app/[tenant]/(dashboard)/layout.tsx:22-25`.

24. **No client-side role gate on settings/table CRUD pages** — not exploitable if backend enforces roles, but confirm backend actually differentiates staff roles; UI currently implies none exists. `settings/page.tsx`, `dashboard/tables/page.tsx`.

25. **Two separate `QueryClient` instances — 401 handler writes to the one not wired into the React tree.** `frontend/src/hooks/api/axios-instance.ts:7` vs `query-provider.tsx`. Logout-on-401 cache clear may not propagate until natural refetch. Fix: use the single shared QueryClient instance (export from `query-provider.tsx`, import in the interceptor) instead of a second module-level instance.

26. **Zustand stores (`use-dashboard-store`, `use-booking-store`) aren't reset on logout or tenant switch.** State (open drawer, filters, in-progress booking) can leak between sessions on a shared browser tab. Fix: call `.getState().reset()` (add a reset action) in the logout handler and on tenant-slug change.

27. **Dev-only silent fallback to a hardcoded mock cafe on backend fetch failure.** `frontend/src/app/[tenant]/layout.tsx:37-58`. Low risk (dev-only) but hides real "cafe not found" bugs locally. Fix: surface the error in dev instead of swallowing it.

28. **No lead-time validation client-side.** `frontend/src/components/booking/date-picker.tsx:76-80` — a user can pick a slot that violates the cafe's `booking_lead_time_hours` and only find out after hitting "pay." Fix: read `reservation_rules` and disable/warn client-side too (backend remains source of truth).

29. **`deposit_amount` accepted from client with no validation.** `backend/src/controllers/public/bookingController.js:8,67`. Unlike `party_size`/`duration_minutes`, no `Number()` coercion/bounds check — negative or `NaN` values can reach Razorpay order creation. Fix: validate as a positive finite number within a sane cap.

30. **`resolveMergeTableIds` doesn't exclude soft-deleted tables when matching by `table_number`.** `backend/src/controllers/admin/tableController.js:12-30` (query at line 15) vs the unique index scoped to `{ cafe_id, table_number, is_deleted }` (`Table.js:43`) allowing number reuse after soft-delete. Fix: add `is_deleted: false` to the merge-resolution query.

31. **Hand-rolled modals with no Escape/backdrop-close, inconsistent with the Radix dialog used elsewhere.** `reservation-drawer.tsx:44`, `table-editor-modal.tsx:104`. Fix: migrate to the shared `ui/dialog.tsx` or add the missing close affordances.

32. **API errors on the reservations list render identically to a real empty state**, hiding failures from staff. `frontend/src/app/[tenant]/(dashboard)/reservations/page.tsx:94`. Fix: distinguish error state from empty state.

33. **Brand color/gradient hardcoded instead of derived from `--brand-primary`, breaking per-tenant theming for those specific surfaces.** `globals.css:44`, `tailwind.config.ts:98`, and `checkout-card.tsx:33` (duplicates the default brand literal instead of importing `DEFAULT_TENANT_THEME`). Fix: route through the CSS variable/token.

34. **`countdown-timer.tsx:28`** — hold-expiry redirect goes to `/` instead of `/${cafe.slug}`, ejecting the user from the tenant entirely; inconsistent with every other redirect in the booking flow.

---

## P3 — Low (cleanup / polish) — all reviewed, 2026-08-10

35. ✅ No server-side token revocation on logout (7-day JWT stays valid). `authController.js`. **Reviewed, no action** — acceptable trade-off; revisit only if a shorter TTL + refresh pattern becomes worth the complexity.
36. ✅ User enumeration on registration (`'User with this email already exists'`). `authController.js`. **Reviewed, no action** — removing the distinct error would require an email-verification flow to stay usable (otherwise users can't tell if registration worked), which is out of proportion for this item; already partially mitigated by the existing `authRateLimiter` (20 attempts/15min) on `/auth/register`.
37. ✅ `createTable` relies solely on the unique-index 11000 handler for dup detection. **Reviewed, no action** — functionally fine; the related soft-delete gap (#30) is fixed.
38. ✅ `decodeJwtPayload` trusts `exp` without signature check client-side. **Reviewed, no action** — expected; server is the source of truth, this only affects UX routing.
39. ✅ **Fixed**: `table-editor-modal.tsx` used native `confirm()` for delete — replaced with a new reusable `ConfirmDialog` (`components/ui/confirm-dialog.tsx`, built on the same Radix `ui/dialog.tsx` primitive already used by `customer-auth-modal.tsx`), TDD'd.
40. ✅ 422 validation errors collapse to a single string client-side. **Reviewed, no action** — the backend's `errorHandler.js` already flattens multi-field Mongoose/Zod errors into one joined `message` string before it reaches the frontend; there's no structured per-field error in the API contract to lose, and the full joined string is already shown untruncated in the toast.
41. ✅ **Fixed**: deleted orphaned `razorpay-checkout.tsx`, `error-state.tsx`, `empty-availability.tsx` (confirmed zero references anywhere else).
42. ✅ **Fixed**: `tables/page.tsx` now uses a new tested `describeTableStatus` helper (`lib/dashboard/table-status.ts`) instead of an inline ternary.
43. ✅ **Fixed**: `table-editor-modal.tsx`'s `as any` replaced with the proper `TableStatus` type.
44. ✅ **Fixed**: "Add to calendar" now generates and downloads a real `.ics` file (new tested `lib/booking/ics.ts` generator) instead of just showing a toast.
45. ✅ **Fixed**: added the missing `relative` class to `success-card.tsx`'s decorative-ring container.
46. ✅ **Fixed**: documented directly in `stateMachine.js` — `CONFIRMED → SEATED` is intentional (host seats a confirmed walk-in party directly without a separate check-in step), not a missing transition.

---

## Suggested execution order

1. **Payments correctness (P0 #1–4)** — one focused PR. This is actively broken revenue-critical logic; fix webhook raw-body verification, frontend payment-verify call, real order-id wiring, and the PENDING_PAYMENT expiry sweep together since they're causally linked.
2. **Tenant isolation & socket auth (P0 #7–8, P1 #9–11, P2 #23)** — one PR. Verify backend tenant checks on every admin/host route first (this determines how much frontend work is defense-in-depth vs. a real fix), then lock down CORS, socket auth, and session storage.
3. **Booking integrity (P0 #5–6, P1 #13, P2 #22, #28–30)** — table locking, table-delete cascade, capacity validation, HOLD expiry sweep (share the cron job with #4).
4. **RBAC & permission consistency (P1 #12, P2 #21, #24)**.
5. **Frontend correctness bugs (P1 #15–16, P2 #25–27, #32, #34)** — mostly small, independent fixes; good candidates for a single cleanup PR each once triaged.
6. **Rate limiting & abuse hardening (P1 #17, P2 #19–20)**.
7. **Design-system/token consistency and dead-code removal (P2 #33, P3 #41–46)** — low risk, batch into a housekeeping pass.

Each PR should add/extend tests in `backend/tests/integration/` (the existing `dashboardSystemRuthless.test.js` is a good model — TDD red→green per bug) and `frontend` test files before merging, per this repo's established workflow.
