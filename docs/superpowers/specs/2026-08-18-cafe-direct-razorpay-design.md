# Cafe-owned Razorpay accounts — design spec

## Problem

Every reservation deposit currently flows through a single platform-owned
Razorpay account (`backend/src/config/razorpay.js`, keyed by the global
`RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` env vars). That makes the platform a
custodian of every cafe's money: settlement, refunds, disputes, and payout
timing are all the platform's problem, and none of that money is visible to
a cafe until the platform hands it off.

Since monetization already runs on a subscription (`Cafe.subscription_status`),
there's no need for the platform to take a cut per transaction — so there's
no need for the platform to touch cafe money at all. Each cafe should use
its own Razorpay account; deposits land directly in the cafe's own balance,
and the cafe manages its own payment history, refunds, and disputes from
their own Razorpay dashboard.

## Scope

In scope: cafes configuring and using their own Razorpay credentials for the
reservation-deposit flow (hold → payment → confirm), including onboarding,
credential storage, checkout gating, and per-cafe webhooks.

Out of scope: any platform-side revenue mechanism tied to payments (already
solved via subscriptions), migrating existing payment data (all current data
is test data — this is a clean cutover, not a migration), and the platform's
own subscription billing (unaffected by this change).

## Data model

`Cafe` gets a new `payments` sub-document:

```js
payments: {
  razorpay_key_id: { type: String, trim: true, default: '' },
  razorpay_key_secret_encrypted: { type: String, default: '' },
  razorpay_webhook_secret_encrypted: { type: String, default: '' },
  configured: { type: Boolean, default: false },
}
```

- `razorpay_key_id` is safe to display in the UI as-is (Razorpay's own key
  IDs are not secret — only the Key Secret is).
- `razorpay_key_secret_encrypted` and `razorpay_webhook_secret_encrypted`
  are AES-256-GCM ciphertext, decrypted only server-side, only at the moment
  they're needed (building a Razorpay SDK client, or verifying a webhook
  signature). They are never returned to the frontend after the initial
  save.
- `configured` is true only once a Key ID + Key Secret pair has been
  validated (see below) and successfully persisted.

### Encryption utility

New file `backend/src/utils/encryption.js`, exporting `encrypt(plaintext)`
and `decrypt(ciphertext)`, implementing AES-256-GCM keyed by a new
`ENCRYPTION_KEY` env var (32 random bytes, base64-encoded, generated once
per environment and never committed). `encrypt()` returns a single string
encoding `iv:authTag:ciphertext` (hex-joined); `decrypt()` reverses it and
throws if the auth tag doesn't verify (tamper/corruption detection for
free, via GCM's built-in integrity check).

This is a new capability — the codebase currently only has one-way hashing
(`backend/src/utils/emailVerification.js`, `passwordReset.js`), which can't
be used here since the whole point is to get the plaintext key back out to
call Razorpay's API with it.

## Onboarding flow

A new "Payments" section is added to cafe settings, alongside the existing
`StorefrontEditor` section, with two inputs: Key ID and Key Secret (the
latter masked, like a password field).

On save (`PUT` to the cafe settings endpoint, extended to accept a
`payments` block):

1. If `razorpay_key_id` and `razorpay_key_secret` are both present in the
   request, construct a temporary Razorpay SDK client with exactly those
   credentials and call `client.payments.all({ count: 1 })` — a free,
   read-only call. This only proves the credentials authenticate against a
   real Razorpay account; it doesn't create or charge anything.
2. If that call throws (401/403), reject the entire settings save with a
   `BadRequestError`: "These Razorpay credentials couldn't be verified.
   Double-check the Key ID and Key Secret from your Razorpay dashboard."
   Nothing is persisted — a cafe never ends up with a half-broken payments
   config sitting in the database.
3. If it succeeds: encrypt the Key Secret, generate a random webhook secret
   via `crypto.randomBytes(32).toString('hex')` if one doesn't already
   exist, encrypt that too, and set `configured: true`.

Once configured, the Payments section shows:
- The Key ID in plaintext, with a "Test mode" / "Live mode" badge derived
  from the `rzp_test_`/`rzp_live_` prefix (pure string check, no extra API
  call).
- The webhook URL to register (`https://<host>/api/v1/webhooks/razorpay/<cafe-slug>`)
  and the generated webhook secret, both meant to be copy-pasted into the
  cafe's own Razorpay dashboard under Settings → Webhooks (subscribing to
  `payment.captured` and `payment.failed`, matching what the existing
  webhook handler processes).
- A "Replace credentials" action that clears the form back to blank inputs
  — changing credentials always means entering both fields fresh; the old
  secret is never shown again or partially reusable.

## Checkout gating

The public storefront (`[tenant]/(public)/page.tsx`) checks
`cafe.payments?.configured` from the cafe data it already fetches. If
false, the reservation widget is replaced with a static message: "Online
reservations aren't available for this cafe yet — please contact them
directly." No hold can be created, so no table inventory gets tied up
behind a payment method that doesn't exist.

As defense in depth (matching the existing pattern of independent
backend-side authorization, e.g. `requirePermission` in
`backend/src/middleware/rbac.js`), the hold-creation endpoint independently
re-checks `cafe.payments.configured` and rejects with a clear error if
false, in case a stale frontend ever lets a request through.

**Exception for local development:** when `NODE_ENV === 'development'` and
a cafe is not `configured`, the existing mock-order fallback in
`paymentService.js` (`[RAZORPAY MOCK FALLBACK]`) still applies, so local
testing isn't blocked by needing real Razorpay credentials for every test
cafe.

## Payment flow changes

`backend/src/services/paymentService.js`:

- `createOrderForReservation` looks up the cafe (already does, for
  `payment_timeout_minutes`), reads `cafe.payments`, and:
  - If not `configured` and not in dev mode: throws `BadRequestError`
    ("This cafe hasn't finished setting up payments yet.")
  - Otherwise: decrypts `razorpay_key_secret_encrypted`, builds a Razorpay
    SDK client with `{ key_id: cafe.payments.razorpay_key_id, key_secret }`,
    and creates the order against *that* client instead of the shared
    global instance.
- `verifyCheckoutPayment`'s signature check (`crypto.createHmac('sha256',
  config.RAZORPAY_KEY_SECRET)`) switches to using the calling cafe's
  decrypted key secret instead of the global one — the HMAC is always keyed
  by whichever account actually created the order.

`backend/src/config/razorpay.js` (the single shared instance) is no longer
imported anywhere in the payment flow once this lands.

## Webhooks

New route: `POST /api/v1/webhooks/razorpay/:cafeSlug`, registered alongside
(and eventually replacing) the current global `POST /api/v1/webhooks/razorpay`.

Handler logic mirrors the existing `handleRazorpayWebhook` in
`webhookController.js`, with one change: instead of verifying against
`config.RAZORPAY_WEBHOOK_SECRET`, it looks up the cafe by `cafeSlug`,
decrypts `payments.razorpay_webhook_secret_encrypted`, and verifies the
`x-razorpay-signature` HMAC against that. Everything downstream (finding
the reservation by `order_id`, idempotency check, state transitions) is
unchanged — those are already reservation-scoped, not account-scoped.

## Cleanup of the old global config

Since every current reservation is test data (per user confirmation) and no
code path will read them after this change ships:

- Comment out (not delete) `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
  `RAZORPAY_WEBHOOK_SECRET` in `backend/.env` and `.env.example`, so
  they're easy to find and re-enable if a platform-level Razorpay account
  is ever needed again for something unrelated (e.g. platform subscription
  billing).
- Comment out the single-instance export in `backend/src/config/razorpay.js`.
- Remove the old global `POST /api/v1/webhooks/razorpay` route once the
  per-cafe route is in place and verified (no cafe can be relying on it,
  since it's all test data).

## Frontend changes

- `frontend/src/lib/types/models.d.ts`: add `payments?: { razorpay_key_id: string; configured: boolean }` to the `Cafe` type. The encrypted fields are never part of the type the frontend ever sees.
- New `PaymentsEditor` component (parallel to `StorefrontEditor`), wired into `[tenant]/(dashboard)/settings/page.tsx`.
- `[tenant]/(public)/page.tsx`: gate the booking widget on `cafe.payments?.configured`.

## Testing

- Unit tests for `encryption.js` (`encrypt`/`decrypt` round-trip, tamper detection via corrupted auth tag).
- Integration tests for the settings save endpoint: valid credentials persist and set `configured: true`; invalid credentials (mocked Razorpay client rejecting) reject the whole save with nothing persisted.
- Integration tests for the per-cafe webhook route: valid signature (keyed by that cafe's secret) processes the event; a signature valid for a *different* cafe's secret is rejected.
- Integration test for hold-creation against an unconfigured cafe: rejected server-side even if attempted directly (bypassing the frontend gate).
- Existing `paymentService.test.js`/`webhookController` tests updated to construct a cafe with `payments.configured: true` and per-cafe credentials instead of relying on the global mock fallback implicitly.
