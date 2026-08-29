# Self-Serve Cafe Onboarding — Design

**Date:** 2026-08-29
**Status:** Approved, ready for implementation planning

## Summary

Today a cafe owner cannot become a cafe owner on their own. They create an
account, and then a platform admin manually provisions their Organization,
Cafe, Subscription, and owner membership via `/admin/onboard-cafe`. There is
no in-product path from "I signed up" to "I run a cafe on nextBooq".

This design adds a self-serve path. After the existing register →
email-verification flow, a control-plane signup is asked once whether they are
a diner or a cafe owner. Cafe owners fill in a short application; the platform
admin reviews it and approves, which runs the *existing* provisioning
transaction. Anyone who skips or abandons the choice can start or resume the
application from `/profile`.

The application carries the cafe's postal address so the reviewer can verify
the business is real, and that address is carried onto the Cafe on approval,
where it becomes cafe-managed content shown on the storefront.

## Goals

- A cafe owner can request a cafe without a human handoff outside the product.
- The platform admin keeps final control: nothing becomes a live tenant, and
  no slug is claimed, without explicit approval.
- Missing the prompt is recoverable — `/profile` is a permanent entry point.
- Every cafe (self-serve or admin-provisioned) ends up with a structured
  address, so a future "cafes near you" search has uniform data to work from.
- The diner-facing storefront signup is completely untouched.

## Non-goals (deliberately deferred)

- Geocoding, distance search, or any "cafes near you" UI. This design only
  ensures the data and schema will support it without a migration.
- A public directory of cafes.
- Collecting operating hours, tables, branding, menu, or Razorpay credentials
  during onboarding. Those stay in `/{slug}/settings` after approval.
- Self-serve subscription payment. The admin still sets term and price at
  approval, exactly as today.
- Any change to how diners sign up or book.

## Current state (verified in code)

- **Tenancy is path-based.** `/{slug}` is a storefront; `/`, `/auth/*`,
  `/profile`, `/org`, `/admin` are the control plane (the `(control-plane)`
  route group). There is no subdomain routing.
- **"Cafe owner" is derived, not stored.** `orgOwnershipService.getOwnedOrgId()`
  reports ownership when the user holds the `owner` role on *every* non-deleted
  cafe in an org. A fresh signup has `staff_memberships: []` and is a "Guest".
- **One write path into tenancy.** `cafeProvisioningService.provisionCafe()`
  transactionally creates Organization + Cafe + Subscription + the owner
  membership, and fails closed when MongoDB cannot support transactions. It is
  reachable only through `POST /api/v1/platform-admin/cafes` behind
  `requirePlatformAdmin`. Slug rules, reserved slugs, and conflict mapping all
  already live there.
- **The register → verify handoff already discriminates surfaces.** The
  control-plane register page is the *only* caller that sets `source=register`
  on `/auth/verify-email`. The storefront's quick-auth
  (`customer-auth-modal.tsx`, `auth-overlay.tsx`) never does. That existing
  flag is what keeps the new interstitial out of the storefront.
- **`/onboarding` is already reserved.** `(control-plane)/onboarding/page.tsx`
  is a stub that redirects to `/`, the slug is in `RESERVED_SLUGS`, and
  `normalizeSafePath` already refuses it as a `callbackUrl`.
- **Resend is wired.** `emailService.js` sends via Resend, degrades to a
  console log when `RESEND_API_KEY` is unset, and `sendContactEmail` is an
  existing precedent for operator-notification mail (recipient resolved from
  config with a fallback, user content HTML-escaped, subject newlines stripped
  against header injection).

## Decisions and rationale

### D1. Application-first, not a pending Cafe

A new `CafeApplication` collection holds the request. No Organization, Cafe,
Subscription, or membership exists until approval, at which point the
unchanged `provisionCafe()` runs.

Rejected alternative: create the Cafe immediately with a `pending` lifecycle
status. That would require auditing every query that assumes a Cafe row is a
real cafe — `getOwnedOrgId()` would flip the applicant to org-owner the
instant they submitted, the tenant route would resolve, and admin views assume
one `is_current` Subscription per cafe (a pending cafe has none). That is a
wide blast radius in a payments-adjacent codebase for no user-visible benefit.

Consequence: a slug is not locked until approval. Handled in D5.

### D2. Intent is stored; status is derived

`User.account_type: 'customer' | 'cafe_owner' | null` (null = not yet asked).
Onboarding *status* is **not** duplicated onto the User — it lives only on the
`CafeApplication`, and `/auth/me` returns a derived
`cafe_application: { id, application_ref, status, cafe_slug } | null`.

Two copies of a status drift the first time an approval partially fails. One
field, derived on read, still delivers everything the stored version would:
resume, no re-prompting, and funnel measurement.

**`account_type` is a UI hint and must never be treated as authorization.**
Authorization stays derived from `staff_memberships` / `getOwnedOrgId()` /
`is_platform_admin`. Setting `account_type: 'cafe_owner'` grants nothing.

### D3. Interstitial keyed on `source=register`

The choice screen appears after email verification, only when the verify page
was reached with `source=register`, which only the control-plane register page
sets. This satisfies the requirement that the prompt never appears in
storefront signups, using a discriminator that already exists.

### D4. Address is one shared shape, optional in schema, required at input

A single `addressSchema` is used by both `CafeApplication` and `Cafe`, so
approval copies the subdocument verbatim with no field mapping.

The field is **optional at the Mongoose schema level** and **required by
`validateAddress` in the provisioning and application input paths**. Making it
`required` on the `Cafe` schema would break every pre-existing cafe: both
`updateCafe` and `updateCafePayments` call `cafe.save()`, which validates the
whole document, so saving Razorpay credentials on an existing addressless cafe
would start throwing. New cafes always have an address; old ones stay saveable
until backfilled.

### D5. Slug checked twice

Availability is checked at submit (advisory — against both `Cafe` and pending
applications) and authoritatively inside `provisionCafe`'s transaction at
approval. A race therefore surfaces to the *reviewer* as a clear conflict at
approval time, rather than to the applicant as a silent failure.

### D6. Geo field now, geocoding later

`Cafe.location` as an optional GeoJSON Point with a `2dsphere` index, left
unset. A 2dsphere index skips documents missing the field, so it is inert
today, and the future "near you" feature becomes a geocoding job plus a
`$near` query with no schema migration and no index backfill.

### D7. Address is cafe-managed and shown on the storefront

The cafe edits its own address (and an optional map URL) in
`/{slug}/settings`; the storefront renders it as a conditional tile. Approval
seeds the initial values from the application.

Note: `PRODUCT.md` describes the five customer-facing screens' fields as fixed
for the current redesign pass. This adds a field beyond that, at the product
owner's explicit direction. It is additive and conditional — the tile is
absent until a cafe fills it in, so no existing storefront changes appearance.

## Data model

### Shared: `backend/src/models/address.js`

```js
const addressSchema = new mongoose.Schema({
  line1:       { type: String, trim: true, maxlength: 200, default: '' },
  line2:       { type: String, trim: true, maxlength: 200, default: '' },
  landmark:    { type: String, trim: true, maxlength: 120, default: '' },
  city:        { type: String, trim: true, maxlength: 100, default: '' },
  state:       { type: String, trim: true, maxlength: 100, default: '' },
  postal_code: { type: String, trim: true, maxlength: 10,  default: '' },
  country:     { type: String, trim: true, maxlength: 100, default: 'India' },
  map_url:     { type: String, trim: true, maxlength: 500, default: '' },
}, { _id: false });
```

Required at the input layer: `line1`, `city`, `state`, `postal_code`.
Optional: `line2`, `landmark`, `map_url`. `country` defaults to `India` and is
not exposed in the wizard.

`postal_code` must match `/^[1-9][0-9]{5}$/` — an Indian PIN, where a leading
zero is invalid. `map_url`, when non-empty, must pass the existing
`isValidHttpsUrl` helper (`https://` only, parseable by `new URL()`), which is
what keeps a `javascript:` URL out of an `href` the storefront renders.

### New: `backend/src/models/CafeApplication.js`

| field | type | notes |
| --- | --- | --- |
| `application_ref` | String | `NB-XXXX-XXXX`, unique index |
| `applicant_user_id` | ObjectId → User | indexed |
| `organization_name` | String | required, trimmed |
| `cafe_name` | String | required, trimmed |
| `cafe_slug` | String | lowercase, validated by the shared slug helper |
| `timezone` | String | validated IANA zone |
| `address` | addressSchema | required at input |
| `status` | String | `pending` / `approved` / `rejected` / `withdrawn` |
| `review_note` | String | rejection reason, shown to the applicant |
| `reviewed_by_user_id` | ObjectId → User | nullable |
| `reviewed_at` | Date | nullable |
| `provisioned_cafe_id` | ObjectId → Cafe | set on approval |
| timestamps | | `created_at` / `updated_at`, matching house style |

Indexes:

- `{ application_ref: 1 }` unique
- `{ applicant_user_id: 1, status: 1 }` — partial unique on `status: 'pending'`,
  enforcing one open application per user
- `{ status: 1, created_at: -1 }` — the admin review queue

**`application_ref` generation.** Eight characters from the Crockford-style
alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (`I`, `L`, `O`, `U` removed so it
cannot be misread or mistyped), formatted `NB-XXXX-XXXX`, drawn from
`crypto.randomInt`. Retry on unique-index collision, bounded at 5 attempts.
Random rather than sequential: a counter needs its own collection and races,
and a sequential id would leak total application volume to every applicant.

### Changed: `backend/src/models/User.js`

```js
account_type: { type: String, enum: ['customer', 'cafe_owner'], default: null },
```

### Changed: `backend/src/models/Cafe.js`

```js
address: { type: addressSchema, default: () => ({}) },
location: {
  type:        { type: String, enum: ['Point'] },
  coordinates: { type: [Number] },   // [lng, lat]
},
```

plus `cafeSchema.index({ location: '2dsphere' })`.

## Backend API

### Applicant-facing — `backend/src/routes/v1/cafeApplicationRoutes.js`

Mounted in `routes/index.js` as
`router.use('/v1/cafe-applications', cafeApplicationRoutes)`. All routes
require `authenticate`.

| method | path | notes |
| --- | --- | --- |
| `POST` | `/api/v1/cafe-applications` | submit; requires `is_email_verified`; `cafeApplicationRateLimiter` |
| `GET` | `/api/v1/cafe-applications/mine` | the caller's latest application |
| `DELETE` | `/api/v1/cafe-applications/mine` | withdraw a pending application |

`POST` returns `409` when the caller already has a pending application, `403`
when their email is unverified, and `400` with a field-level message for
validation failures (including an advisory slug conflict).

### Account type — added to `authRoutes.js`

| method | path | notes |
| --- | --- | --- |
| `PATCH` | `/api/v1/auth/account-type` | body `{ account_type: 'customer' \| 'cafe_owner' }` |

### Admin-facing — added to `platformAdminRoutes.js`

| method | path | notes |
| --- | --- | --- |
| `GET` | `/api/v1/platform-admin/cafe-applications` | filterable by status |
| `GET` | `/api/v1/platform-admin/cafe-applications/:id` | full detail |
| `POST` | `/api/v1/platform-admin/cafe-applications/:id/approve` | body `{ subscription: { status, term_months, price_per_month, note? } }` |
| `POST` | `/api/v1/platform-admin/cafe-applications/:id/reject` | body `{ note }` |

**Approve** calls `provisionCafe()` with the application's org name, cafe
name, slug, timezone, address, and the reviewer's chosen subscription, then
marks the application `approved` and records `provisioned_cafe_id`. If
`provisionCafe` throws a `ConflictError` (slug taken in the interim), the
application stays `pending` and the reviewer sees the conflict — nothing is
half-applied, because the provisioning transaction is the only writer.

Submit, approve, and reject each emit `logAuditEvent`.

### Changed: `provisionCafe()`

`validateProvisionInput` gains a required `address`, validated by the shared
`validateAddress`, and `provisionCafe` writes it onto the new Cafe. Slug,
timezone, and name helpers move out of `cafeProvisioningService.js` into
`backend/src/utils/cafeInput.js` and are imported by both the provisioning
service and the application controller, so the two can never drift.

### Changed: `updateCafe()`

An `address` validation block mirroring the existing `contact_phone` block,
gated by the existing `edit_settings` permission, letting a cafe correct its
own address and map URL.

## Email

New `sendCafeApplicationReviewEmail` in `emailService.js`, following
`sendContactEmail` exactly:

- **To:** `ADMIN_EMAIL || CONTACT_EMAIL || FROM_EMAIL`. `ADMIN_EMAIL` is a new
  optional env var; the fallback chain means this works with no config change.
- **Reply-To:** the applicant's email, so the reviewer can reply to ask a
  question directly.
- **Subject:** `New cafe application NB-XXXX-XXXX — {cafe name}`, with
  newlines stripped from the cafe name against header injection.
- **Body:** application ref, applicant name/email/phone, organization name,
  cafe name, requested slug, timezone, full address, map URL, submitted-at,
  and a link to `{FRONTEND_URL}/admin/cafe-applications/{id}`. Every
  user-supplied value passed through the existing `escapeHtml`.
- **Fire-and-forget** with `.catch`, matching `registerUser` and
  `customerQuickAuth`: a Resend outage must never fail an application that was
  otherwise written successfully.

Approval and rejection also email the applicant (approval links to
`/{slug}/dashboard`; rejection carries `review_note` and points at the
re-apply entry point in `/profile`).

## Frontend flow

### Role choice

`(control-plane)/onboarding/page.tsx` stops redirecting and becomes the choice
screen: *"I'm booking a table"* vs *"I run a cafe."*

`verify-email`'s `handleSuccess` routes to `/onboarding` instead of the
resolved destination **only when `source === 'register'`**. Every other entry
to that page — including every storefront path — is unchanged.

- **Customer** → `PATCH /auth/account-type` → the destination
  `resolvePostAuthDestination` would have produced. Never asked again.
- **Cafe owner** → `PATCH /auth/account-type` → `/onboarding/cafe`.

### Wizard — `(control-plane)/onboarding/cafe/page.tsx`

Four steps, values held in a draft so a refresh does not lose them:

1. **Organization** — organization name.
2. **Cafe** — name, slug (with a debounced availability check), timezone
   (default `Asia/Kolkata`).
3. **Address** — line 1, line 2, landmark, city, state, PIN, optional map URL.
4. **Review** — read-only summary, then submit.

Submit → `/onboarding/status`, showing the application reference, what happens
next, and a withdraw action.

### Route protection

`route-guard.ts` gains an `ONBOARDING_ROUTE_PATTERN` so `/onboarding/*` is a
protected route — an anonymous visitor is redirected to login rather than
seeing the wizard. `normalizeSafePath`'s existing refusal of `/onboarding` as
a `callbackUrl` stays as-is; an authenticated user reaching `/onboarding`
directly works fine.

### Profile entry point

One state-driven card in `/profile`, under the existing account section:

| state | card |
| --- | --- |
| no application, not staff or owner | **"Register your cafe"** → the wizard |
| pending | reference, submitted date, withdraw |
| rejected | `review_note`, plus **re-apply** |
| approved, or already owner/staff | hidden entirely |

### Cafe settings

`/{slug}/settings` gains an Address section — the structured fields plus the
map URL — saved through the existing `updateCafe` call, following the
`contact_phone` pattern already in that page.

### Storefront

`cafe-info-card.tsx` gains an address tile, rendered only when an address is
set — the same conditional pattern `contact_phone` already uses, including its
whitespace-only guard. When `map_url` is set the address text is a link with
`target="_blank" rel="noopener noreferrer"`; otherwise it is plain text, never
a dead link.

### Admin

- `/admin/cafe-applications` — the review queue, linked from `/admin`
  alongside the existing "Onboard Cafe" button.
- `/admin/cafe-applications/[id]` — full detail including the address and map
  link, which **prefills the existing `CafeOnboardingForm`** so the reviewer
  still chooses subscription term and price before approving. Reject takes a
  note.
- `/admin/onboard-cafe` is unchanged in purpose but gains an address step
  (5 → 6), because `provisionCafe` now requires one. Without it,
  admin-provisioned cafes would be precisely the ones missing the data the
  future "near you" search depends on.

## Existing-code fix in scope

`RESERVED_SLUGS` in `cafeProvisioningService.js` is
`{admin, api, auth, onboarding, pricing, _next}` — it omits `org` and
`profile`. This is harmless while only a trusted admin picks slugs, but under
self-serve an applicant could claim `/org` or `/profile` and receive a cafe
that can never render, since a static Next.js segment always wins over the
`[tenant]` dynamic segment. Both are added to the set.

## Security and abuse

- `account_type` is non-authoritative (D2); no endpoint grants access from it.
- Submission requires a verified email, reusing the existing gate.
- `cafeApplicationRateLimiter` at 3/hour — its own bucket, not shared with
  `contactFormRateLimiter`'s 5/hour, so hammering one form cannot exhaust the
  other's quota. This matters more than usual because submission sends mail to
  the operator.
- One pending application per user, enforced by a partial unique index rather
  than an application-level check, so concurrent submits cannot both win.
- All applicant-supplied content is HTML-escaped in email and validated
  server-side; `map_url` is restricted to `https://`.
- Nothing an applicant submits reaches a live tenant without an explicit admin
  approval action.

## Testing

**Backend (`jest`, `backend/tests/`):**

- `validateAddress`: PIN format including the leading-zero rejection, required
  fields, `map_url` https-only, length caps.
- `application_ref` format, alphabet, and collision retry.
- Submit: unverified email → 403; second pending application → 409; advisory
  slug conflict → 400; success writes the document and triggers the email.
- Approve: calls `provisionCafe`, copies the address onto the Cafe, sets
  `provisioned_cafe_id`; a slug taken in the interim leaves the application
  `pending` and writes no partial state.
- Reject → re-apply is permitted.
- `provisionCafe` still rejects an invalid or missing address.
- `updateCafe` accepts a valid address and rejects a bad PIN or non-https
  `map_url`; an existing addressless cafe can still save payments (the D4
  regression guard).

**Frontend (`vitest`):**

- `verify-email` routes to `/onboarding` with `source=register` and **does
  not** for a storefront verification — the key surface-isolation test.
- Each wizard step's validation and the draft surviving a remount.
- All four profile card states.
- `cafe-info-card` renders no address tile when unset or whitespace-only, text
  when set without `map_url`, and a correctly-`rel`'d link when set with one.
- `route-guard` protects `/onboarding/*`.

`npm run typecheck` and `npm run lint` in `frontend/` must pass.

## Follow-ups (not in this change)

- Geocoding on address save, and the "cafes near you" search that consumes
  `Cafe.location`.
- Backfilling addresses for cafes provisioned before this change.
- A public cafe directory.
- An applicant confirmation email on submit (the reference is already shown on
  the status screen, so this is a convenience, not a gap).
