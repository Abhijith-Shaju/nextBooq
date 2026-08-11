# Platform Admin Subscription Dashboard

Date: 2026-08-11
Status: Approved

## Problem

nextBooq (the SaaS product itself, not any individual cafe) currently has no
way for its operator to see across tenants. Every login is scoped to one
cafe's staff (`owner`/`manager`/`host`/`staff` via `staff_memberships`) — there
is no "I work for nextBooq" identity, and no screen anywhere lists every
organization, every cafe, or their subscription state.

Subscription state technically exists (`Cafe.subscription_status`, enum
`trial`/`active`/`past_due`/`inactive`, enforced by
`enforceSubscriptionForWrite` middleware which blocks writes for
`inactive`/`past_due` cafes) but nothing ever changes it. Every cafe is
hardcoded to `active` at signup (`cafeController.js`) and stays that way
forever, because there was never a mechanism to revisit it. A second model,
`Subscription` (org_id, cafe_id, plan_tier, status, current_period_end),
exists in the schema but is never created, read, or updated anywhere —
dead scaffolding.

There is also no billing automation of any kind for cafe subscriptions today.
The only live payment integration (Razorpay Orders) is for a diner's
per-reservation deposit, unrelated to what a cafe pays nextBooq.

## Goal

A platform-admin-only dashboard where the operator (a real person, not a
cafe) can see every organization and cafe, each one's current plan/term/
price/status, which ones need renewal attention, computed revenue, and can
record a payment they've verified happened outside the app (bank transfer,
UPI, invoice — whatever channel) by setting or renewing a cafe's plan term,
or directly flip a cafe's status (trial / active / past_due / inactive) as a
quick override.

## Non-goals (confirmed with the user)

- **No automated billing.** No Razorpay Subscriptions/UPI Autopay
  integration, no webhook-driven payment verification, no recurring charge
  automation. The admin manually confirms payment happened and records it.
  Automated billing is a materially larger, separate project (mandate setup,
  new webhook event types, dunning) and is not in scope here.
- **No payment ledger.** Revenue is a live computed figure (sum of
  `price_per_month × term_months` across currently-active subscriptions),
  not a transaction-by-transaction log of money received.
- **No legal/contract enforcement.** The system cannot make a cafe keep
  paying for a committed term. The only enforcement lever is functional:
  when a cafe's status isn't `active`, `enforceSubscriptionForWrite` already
  blocks new writes for that cafe. Any actual legal contract/ToS a cafe
  agrees to at signup is a business/legal artifact outside this app's code.
- **No change to cafe signup.** New cafes keep defaulting to `active` with
  no expiry, exactly as today. The admin sets a cafe's real term manually
  once onboarded. Trial-by-default at signup can be a future addition.
- **No named plan tiers.** One product, differentiated only by committed
  term length (1 / 6 / 12 / 18 months) and price, per the user's actual
  pricing: ₹9,000/mo (monthly), ₹8,000/mo (6-month), ₹7,000/mo (12-month),
  ₹6,000/mo (18-month) — each billed as that monthly rate × the term length.
  These are seeded as the initial defaults; the admin can record a different
  `price_per_month` per cafe if a one-off deal is negotiated.

## Data model

### `Subscription` (rewritten — the model already exists but is unused, so
this replaces its shape rather than adding a competing model)

One document per **committed term** for a cafe. A renewal inserts a new
document rather than mutating the old one, so subscription history survives
(per the user: cheap to capture now, impossible to reconstruct later, and
useful for "has this cafe ever lapsed," receipts, and disputes).

```js
{
  org_id: ObjectId,          // ref Organization
  cafe_id: ObjectId,         // ref Cafe, indexed
  term_months: Number,       // enum [1, 6, 12, 18]
  price_per_month: Number,   // ₹, whole rupees, snapshot at time of recording
  period_start: Date,        // defaults to now when recorded
  current_period_end: Date,  // server-computed: period_start + term_months
  status: String,            // enum ['trial', 'active', 'past_due', 'inactive']
  is_current: Boolean,       // true for the one record that reflects the
                             // cafe's live state; false for superseded history
  created_by: ObjectId,      // ref User — which platform admin recorded this
  note: String,              // optional free-text (e.g. "paid via UPI on Aug 11")
  created_at: Date,
}
```

Indexes: `{ cafe_id: 1, is_current: 1 }` (fast "what's this cafe's live
state" lookups, used on every list/overview render) and
`{ cafe_id: 1, period_start: -1 }` (history, ordered newest-first).

`plan_tier` is dropped — there's no named-tier concept, just term length.

### `Cafe.subscription_status` — unchanged field, new writer

Every write to a `Subscription` document's `status` also writes the same
value to `Cafe.subscription_status` in the same request. This is what
`enforceSubscriptionForWrite` already reads — it is not touched, and the
booking flow's behavior is unaffected by this feature except through that
one field, exactly as it already works today.

### `User.is_platform_admin`

New field, `Boolean`, default `false`. Not settable through any UI or API —
grantable only via a one-off backend script (`scripts/grantPlatformAdmin.js`,
mirroring the existing `scripts/seed.js`), since this identity should not be
self-serve or creatable by anything reachable over HTTP.

### Legacy cafes (pre-existing, before this feature)

Every cafe created before this feature has **no** `Subscription` document —
the model was dead code, so no historical data exists to backfill. The admin
UI must handle a cafe with zero subscription records as an explicit
"Unconfigured — no plan set" state, not an error. Recording that cafe's
first term uses the exact same action as a renewal (there's no meaningful
difference between "first term" and "renewal" — both just insert a new
`Subscription` doc and mark any prior one non-current, which for an
unconfigured cafe is a no-op since there is no prior one).

## Backend design

### `subscriptionAdminService.js` (new)

- `getOverviewStats()` — total org count, total cafe count, counts grouped
  by current status, and computed revenue (sum of
  `price_per_month × term_months` over `is_current: true, status: 'active'`
  documents).
- `listOrgsWithCafes()` — every `Organization`, each with its `Cafe`s, each
  cafe annotated with its current (`is_current: true`) `Subscription` or
  `null`.
- `getCafeSubscriptionHistory(cafeId)` — all `Subscription` docs for a cafe,
  `period_start` descending.
- `recordSubscriptionTerm({ cafeId, orgId, termMonths, pricePerMonth,
  adminUserId, note })` — the "set plan / renew" action. Marks any existing
  `is_current: true` doc for that cafe as `false`, inserts a new doc
  (`period_start: now`, `current_period_end` computed server-side —
  never client-supplied, to prevent an admin-panel bug from silently
  extending someone's paid-through date), `status: 'active'`, syncs
  `Cafe.subscription_status = 'active'`.
- `setSubscriptionStatus({ cafeId, status, adminUserId, note })` — the quick
  override. Updates the `is_current` doc's `status` field only (term/price/
  period_end untouched) and syncs `Cafe.subscription_status`. This is how
  "trial" or "disabled" (`inactive`) get set without implying a paid term —
  e.g. manually granting a goodwill trial, or disabling a cafe for
  non-payment without recording a new committed term. **Requires an existing
  `is_current` `Subscription` doc** — every field it doesn't touch
  (`term_months`, `price_per_month`, `current_period_end`) is still
  schema-required, so there must already be one to update. A fully
  unconfigured cafe (no subscription doc at all) has nothing for this to
  act on; throws 404/`NotFoundError` in that case. The frontend reflects
  this by only showing "Change status" once a cafe has a plan, and showing
  "Record payment / renew" (which always supplies term + price, and so
  always succeeds regardless of prior state) as the only action for an
  unconfigured cafe.

### `subscriptionExpiryService.js` (new, mirrors `reservationExpiryService.js`)

`expireLapsedSubscriptions()` — finds `Subscription` docs with
`is_current: true, status: 'active', current_period_end <= now`, flips
`status` to `past_due`, syncs `Cafe.subscription_status`. Wired into the
same `setInterval` sweep already running in `server.js` alongside
`expireStalePendingPayments`/`expireStaleHolds`. This is the entire "system
reminds you" mechanism — a clock check, no payment verification.

### `requirePlatformAdmin` middleware (new)

Runs after the existing `authenticate` middleware (reuses the current JWT
session — no new auth mechanism). Checks `req.user.is_platform_admin`,
throws 403 otherwise.

### Routes (new), mounted at `/api/v1/admin`, every route gated by
`authenticate` + `requirePlatformAdmin`:

- `GET /overview` → `getOverviewStats()`
- `GET /orgs` → `listOrgsWithCafes()`
- `GET /cafes/:cafeId/subscriptions` → `getCafeSubscriptionHistory()`
- `POST /cafes/:cafeId/subscriptions` → `recordSubscriptionTerm()`
- `PATCH /cafes/:cafeId/subscriptions/status` → `setSubscriptionStatus()`

## Frontend design

New route group `frontend/src/app/admin/`, entirely outside the `[tenant]`
tree — no `TenantThemeProvider`, no per-cafe branding. This is nextBooq's
own operator surface, styled plainly and consistently, not themed to any
cafe.

- `layout.tsx` — redirects to `/auth/login` if unauthenticated, and to `/`
  (with a toast) if authenticated but `!user.is_platform_admin`. Checked
  client-side for UX; the real gate is server-side (`requirePlatformAdmin`).
- `page.tsx` (Overview) — stat tiles (orgs, cafes, active, pending, revenue)
  plus the full org → cafe list, each row showing term, price, status, and
  `current_period_end`, with a status badge. "Pending" = `current_period_end`
  within 7 days or already past.
- Cafe detail (drawer, opened from a list row) — current plan, a "Record
  payment / renew" form (term length, price, optional note), a "Change
  status" quick-action (trial / active / past_due / inactive), and the
  subscription history table for that cafe.

New hooks (TanStack Query, following existing conventions in
`frontend/src/hooks/`): `use-admin-overview.ts`, `use-admin-orgs.ts`,
`use-cafe-subscriptions.ts`, `use-record-subscription-term.ts`,
`use-set-subscription-status.ts`.

`User` type gains `is_platform_admin?: boolean`, threaded through the
existing auth context so the admin layout can read it.

## Testing

- Backend integration tests: `requirePlatformAdmin` rejects a non-admin
  user (403) and a cafe-staff-authenticated request; accepts a platform
  admin. `recordSubscriptionTerm` correctly supersedes the prior `is_current`
  doc and computes `current_period_end`. `setSubscriptionStatus` updates
  status without touching term/price, and 404s for a cafe with no existing
  `Subscription` doc. `expireLapsedSubscriptions` flips a
  lapsed active subscription to `past_due` and syncs `Cafe.subscription_status`,
  and leaves non-lapsed ones untouched. `getOverviewStats`'s revenue
  computation matches a hand-computed sum across a mixed fixture (active,
  past_due, unconfigured cafes).
- Frontend tests: admin layout redirects a non-admin user; overview renders
  computed stats from a mocked response; the "record term" form submits the
  expected payload; the "unconfigured" state renders for a cafe with no
  subscription history.
