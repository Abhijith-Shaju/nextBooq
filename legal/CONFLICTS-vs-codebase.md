# Legal documents vs. codebase — conflict register

Every factual claim the three published documents make about how nextBooq
behaves, checked against the code as of `f216e58`. Listed worst first.

Each entry says which way I'd resolve it, because for some of these the
document is right and the *code* is the thing that's missing.

---

## 1. Cancelling does not trigger a refund — nothing in the codebase issues one

**Document says** — T&C §7:
> the Café Partner processes the cancellation from its dashboard, which updates the Reservation status and **triggers a refund** of the Reservation Fee to the original payment method … typically within 5–7 business days.

and:
> **Café Partner–initiated cancellation:** If a Café Partner cancels a confirmed Reservation … the full Reservation Fee **will be refunded** to the Guest.

Cancellation & Refund Policy §4 repeats this across its whole outcome table.

**Code does** — there is **no refund call anywhere in the repository**:

```
grep -rn "refunds\.\|\.refund(" backend/src/   →  no matches
```

Cancelling sets `status: 'CANCELLED'` via `stateMachine.transitionState` and
does nothing else. No Razorpay refund is created, no refund is queued, and
nothing tells the café staff that a refund is owed. The money simply stays in
the café's Razorpay account until a human notices and refunds it manually
from Razorpay's own dashboard.

**Severity** — highest on this list. This is the one promise a guest is most
likely to rely on and most likely to complain about, and the platform has no
mechanism behind it.

**Direction** — I would fix the **code**, not the document. Either call
Razorpay's refund API on cancellation, or (smaller) add a "refund owed" queue
in the dashboard like the existing `requires_manual_refund` flag, so staff are
told. Softening the wording to "the café will refund you" leaves a promise
with nobody accountable for keeping it.

---

## 2. The no-show grace period does not exist

**Document says** — T&C §7:
> If a Guest does not arrive within **the grace period stated by the Café Partner at booking**, the Reservation Fee may be forfeited …

and:
> Each Café Partner's specific cancellation window **and no-show grace period are displayed to the Guest** before the Reservation Fee is charged.

**Code does** — there is no grace-period field on `Cafe`, nothing stores one,
and nothing displays one. The only `grace` in the backend is a 60-second
tolerance on the booking lead time, which is unrelated.

**Severity** — high, because the grace period is the *justification* offered
for keeping a guest's money. Forfeiting against a disclosed grace period is
defensible; forfeiting against one that was never disclosed is much less so.

**Direction** — either add the field (it's the sibling of the cut-off we just
added) or remove the claim. Adding it is the stronger position.

---

## 3. There is no "I Agree" — acceptance is browsewrap in practice

**Document says** — T&C §1:
> By **clicking "I Agree"**, creating an account, confirming a reservation, or otherwise using the Platform, you affirmatively accept these Terms …

**Code does** — no consent checkbox exists on the register form, the login
form, the booking auth overlay, or checkout. Nothing records that a user
accepted anything.

**Severity** — high. Indian courts treat clickwrap as materially stronger
evidence than browsewrap, and the document claims clickwrap that isn't there.

**Direction** — fix the **code**: a checkbox at registration and at checkout,
ideally recording the accepted version and timestamp on the user/reservation.

---

## 4. The name cannot be changed

**Document says** — Privacy Policy §7.2:
> **Correction and completion** … You can change your own **name**, email, and phone from your profile at any time.

**Code does** — `POST /auth/change-email` and `POST /auth/change-phone` exist.
There is no name-change endpoint. Name is set at registration and is not
editable by the user.

**Direction** — either add the endpoint or drop "name" from the sentence.
Note the DPDP right of correction still applies regardless, so if the claim is
removed, the manual route via the Grievance Officer has to actually work.

---

## 5. A booking *is* created before payment

**Document says** — Cancellation & Refund Policy §6:
> If your payment fails, **no booking is created** and no amount is captured.

**Code does** — `createHoldReservation` writes a `Reservation` with status
`HOLD`, and `createOrderForReservation` moves it to `PENDING_PAYMENT`, both
*before* the guest reaches Razorpay. A failed payment leaves that record in
place, holding the table until the expiry sweep clears it.

Nothing is *charged* — that half is true — but a booking record exists, and it
occupies the table in the meantime.

**Direction** — reword. Something like "no confirmed booking results, and no
amount is captured; the table is released shortly afterwards."

---

## 6. The countdown shown to the guest is not the deadline that is enforced

**Document says** — T&C §6:
> A table hold expires automatically if payment is not completed within **the time window shown at checkout**.

Refund Policy §2: "held … (shown at checkout — typically **10 minutes**)".

**Code does** — two different clocks:

| | field | default | drives |
|---|---|---|---|
| Shown at checkout | `hold_expires_at` (from `hold_duration_minutes`) | 10 min | the countdown component |
| Actually enforced | `payment_data.expires_at` (from `payment_timeout_minutes`) | 15 min | `expireStalePendingPayments` |

By the time the guest is on the checkout screen the reservation is
`PENDING_PAYMENT`, and the HOLD sweep only matches `status: 'HOLD'` — so
`hold_expires_at` is inert. The real deadline is 15 minutes.

The direction is safe (the guest is given *more* time than shown, not less),
but the documents describe the displayed window as the operative one, and it
isn't.

**Also:** `payment_timeout_minutes` is **not exposed in the settings UI** at
all, so a café cannot configure the deadline that actually applies. The
setting labelled "Checkout Hold Duration" edits the other one.

---

## 7. GSTIN is never collected

**Document says** — T&C §5:
> Café Partners must provide accurate business details (café name, address, **GSTIN where applicable**) …

**Code does** — no `gstin` field on the `Cafe` model, none in `cafeInput`
validation, no input in the settings UI. It is never asked for or stored.

**Direction** — add the field (it's also referenced in the Contact page's
business details) or drop it from §5.

---

## 8. Café address and contact details are optional, so §8's disclosure is not guaranteed

**Document says** — T&C §8:
> **For every Reservation**, the Platform displays: the Café Partner's business name, address, and contact details, in compliance with Rule 5 of the Consumer Protection (E-Commerce) Rules, 2020.

**Code does** — on the `Cafe` model, `address` defaults to `{}` and
`contact_phone` defaults to `''`. Both are optional, and the storefront hides
those tiles when they're blank. A café that never fills them in displays
neither.

**Severity** — this is the specific disclosure the E-Commerce Rules require,
so "for every Reservation" is doing real work in that sentence.

**Direction** — fix the **code**: make address and contact phone mandatory
before a café can accept bookings (there is already a `payments.configured`
gate to model it on).

---

## 9. Stated data-retention periods have nothing implementing them

**Document says** — Privacy Policy §6 gives retention windows (account data,
financial records ~8 years, security logs, etc.).

**Code does** — there is no retention job, no purge, no scheduled deletion of
anything. `grep` for `retention|purge|deleteMany` across services returns
nothing. Data is kept forever.

**Direction** — the periods are reasonable; nothing enforces them. Either
build the purge or state the periods as intentions rather than practice. Note
the DPDP Act requires erasure once the purpose is served, so this one does
eventually need code.

---

## 10. DPDP rights have no mechanism behind them

**Document says** — T&C §16 and Privacy §7: access to a summary of your data,
correction, erasure, nomination.

**Code does** — no data-export endpoint, no account-deletion endpoint, no
nomination concept. All of these would have to be done by hand off the back of
an email.

**Direction** — manual handling is legally acceptable *if it actually
happens*. Worth deciding who does it and how it's logged before launch,
because right now there's no process and no evidence trail.

---

## 11. A bare `[X]` placeholder is live on the public page

**Document says** — T&C §13:
> … shall not exceed the platform service fee (if any) paid by the relevant party in the preceding **[X]** months.

This one was missed when the other placeholders were converted to
`{{TODO:...}}` markers, so it renders literally as "[X]" on
`https://www.nextbooq.in/legal/terms` right now. My placeholder-rendering
only substitutes `{{TODO:...}}`, so this slipped through both the tests and
the visual check.

**Direction** — pick a number (12 months is typical) or convert it to a
`{{TODO:}}` marker so it renders as an obvious placeholder like the rest.

---

## 12. Change notifications have no delivery mechanism

**Document says** — T&C §20: material changes notified "via email or
in-dashboard notice **at least 15 days in advance**".

**Code does** — no broadcast email, no in-dashboard announcement component.
Resend is wired for transactional mail only.

**Direction** — low priority; just be aware the commitment is manual.

---

## 13. Café notes about a guest were declared but never existed *(correction)*

**This entry corrects an error in an earlier revision of this document**,
which listed Privacy §2's data inventory as wholly accurate. It was verified
by confirming the field existed on the schema, without checking whether
anything ever wrote to it. Nothing did.

**Document said** — Privacy Policy §2.2:
> Café Partner notes about you — Staff at a café you have booked with can record free-text private notes against your record at that café. You have a right of access to these — see §7.

**Code did** — `private_notes` existed on the `CafeCustomer` model with
`default: ''`, and **nothing wrote it**: no route, no service, no UI. Every
row in production held the empty-string default. The policy described a
surveillance capability that did not exist, which is both false and
needlessly alarming to a guest reading it.

**Resolved** — the field is removed from the model and the claim is removed
from the Privacy Policy. Reinstate both together if staff note-taking is ever
wanted, along with a route letting a guest read the notes back, since the
policy promised exactly that access.

---

## 14. Visit and no-show counts were collected for a purpose that was not real

**Document says** — Privacy Policy §3 justifies holding these as:
> Letting a café recognise repeat guests and manage no-shows

**Code did** — `stateMachine.js` has always incremented `total_visits` on
`COMPLETED` and `total_no_shows` on `NO_SHOW`, and the counters were
genuinely accumulating in production. But **no route exposed them and no UI
read them**, so no café could recognise anything. Behavioural records about
identifiable people were being accumulated for a stated purpose that nothing
could serve — which is a purpose-limitation problem under the DPDP Act, not
merely a missing feature.

**Resolved** — the host manifest now attaches each guest's counts, and the
reservation drawer shows them as a repeat-guest badge and a no-show warning.
The stated purpose is now true. The alternative, had the feature not been
wanted, was to stop collecting them.

---

## Claims I checked and found accurate

Worth recording, so the list above isn't mistaken for the whole picture:

- **"nextBooq does not store card, UPI, or bank credentials"** — true. Card
  data goes to Razorpay's own checkout; only order/payment ids are stored.
- **"Payments are processed through the Café Partner's own Razorpay account"** —
  true, per-café credentials, encrypted at rest.
- **"The only cookie we set is a session cookie (`nb_session`), HttpOnly"** —
  true; that is the only `res.cookie` call in the backend.
- **Privacy §2's data inventory** — accurate for the audit logs holding IP
  addresses, and for the per-café `total_visits` / `total_no_shows` counters.
  It was **not** accurate about `private_notes` — see entry 13, which corrects
  an error in an earlier revision of this register.
- **Privacy §8's security claims** — bcrypt password hashing, HttpOnly
  sessions, AES-256-GCM for café payment credentials, role-scoped access,
  HTTPS, audit logging. All verified.
- **Per-café fee terms, snapshotted at booking** (T&C §6) — true as of
  `f6901e1`, including that a later café change does not affect existing
  bookings.
- **"A hold expires and the table is released"** — true; availability queries
  exclude expired holds directly, independent of the sweep.
- **"Flagged for manual refund review"** on a technical failure — true,
  `payment_data.requires_manual_refund` plus the platform-admin queue.
- **Age 18+ (T&C §4)** — no DOB is collected and nothing verifies age, but it
  is framed as a user representation, which is normal, and Privacy §10's
  "we do not *knowingly* process children's data" is consistent with that.
- **"Inclusive of applicable taxes" (T&C §6)** — no tax handling exists; the
  fee is a single number the café types in. The claim is true only if the café
  enters a tax-inclusive figure. Not a contradiction, but nothing supports it.

---

*Compiled from the code, not from the documents' own claims. Every entry above
was verified against the source rather than inferred.*
