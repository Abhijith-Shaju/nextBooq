# Setting up Razorpay for your café

**Last Updated: 8 September 2026**

nextBooq collects a small reservation fee from each guest when they book a
table. That money goes **directly into your own Razorpay account** — it never
passes through nextBooq, and we never hold it.

That means you need your own Razorpay account, and you'll connect it to
nextBooq once. This guide takes about twenty minutes, plus however long
Razorpay takes to verify your business.

---

## Before you start

You'll need:

- Your business PAN
- A bank account in the business's name
- An address proof for the business

You do **not** need a registered company. Razorpay accepts individuals and
proprietorships, which covers most independent cafés.

---

## 1. Create your Razorpay account

Sign up at [razorpay.com](https://razorpay.com) and complete the KYC
verification.

**Start this first, before anything else in this guide.** Verification usually
takes a day or two, and sometimes longer. Nothing below will work with real
money until Razorpay has approved your account, so it's the one step worth
beginning before you need it.

You can do everything else in test mode while you wait.

---

## 2. Get your API keys

In the Razorpay dashboard, go to **Account & Settings → API Keys** and
generate a key.

You'll get two values:

| Value | Looks like | Notes |
|---|---|---|
| Key ID | `rzp_live_XXXXXXXXXXXX` | Safe to share |
| Key Secret | a long random string | **Shown once.** Copy it now |

Razorpay shows the key secret exactly once. If you lose it you can't recover
it — you generate a new key and repeat this setup.

**Test mode vs live mode.** Razorpay gives you separate keys for each. Test
keys start with `rzp_test_` and let you practise the whole flow without money
moving. Live keys start with `rzp_live_` and take real payments. You can set
up with test keys first and switch later; just remember that a booking paid
with test keys puts nothing in your bank account.

---

## 3. Enter the keys in nextBooq

In your nextBooq dashboard, go to **Settings → Payments** and paste in your
Key ID and Key Secret, then save.

When you save, nextBooq shows you two things you need for the next step:

- A **webhook URL**, which is unique to your café
- A **webhook secret**, generated for you

**Copy both before leaving that page.** The secret is shown once, exactly like
Razorpay's. If you navigate away you'll need to save your keys again to get a
fresh one — and a fresh secret means redoing step 4.

---

## 4. Tell Razorpay where to send updates

This is the step most people get wrong, and the one where mistakes are hardest
to notice. Take it slowly.

In Razorpay, go to **Account & Settings → Webhooks → Add New Webhook**.

**Webhook URL** — paste the URL nextBooq showed you, exactly as it appeared.
It looks like this, with your café's name at the end:

```
https://api.nextbooq.in/api/v1/webhooks/razorpay/your-cafe
```

Check it begins with **`api.nextbooq.in`**. A URL starting with
`www.nextbooq.in` or `nextbooq.in` will silently fail — see the
troubleshooting table below.

**Secret** — paste the webhook secret nextBooq gave you in step 3. Not your
API key secret; they are different values.

**Active Events** — tick exactly these two:

- `payment.captured`
- `payment.failed`

Leave everything else unticked. Other events are ignored, and subscribing to
them only adds noise to your logs.

Then save.

---

## 5. What the webhook is actually for

Worth understanding, because it explains why step 4 matters.

When a guest pays, their browser tells nextBooq the payment succeeded and the
booking is confirmed. That works most of the time.

The webhook is the backup for when it doesn't: a guest whose phone loses
signal, who closes the tab too early, or whose browser crashes between paying
and returning. Razorpay tells us directly, so the booking still confirms and
the guest still gets their table.

It also catches the reverse case — a payment that arrives after the table hold
has already expired. nextBooq flags that for a refund automatically, so the
guest isn't left out of pocket.

**If the webhook isn't working, both of those protections are silently
missing.** Everything looks fine until the day it isn't.

---

## 6. Test it, and check the result

Make a real booking at your own café and pay for it.

Then — and this is the part worth not skipping — go to **Account & Settings →
Webhooks** in Razorpay and look at the delivery log for your webhook.

You want to see **200** next to the event. That means it reached nextBooq and
was accepted.

| What you see | What it means | Fix |
|---|---|---|
| **200** | Working correctly | Nothing to do |
| **404** | The URL is wrong — usually `www.nextbooq.in` instead of `api.nextbooq.in`, or the café name is missing from the end | Re-check the URL against what nextBooq showed you |
| **400** or **401** | The secret doesn't match | Re-save your keys in nextBooq to get a fresh webhook secret, then update it in Razorpay |
| No events at all | The webhook wasn't saved, or no payment has been made yet | Check the webhook exists and is marked Active |

Nothing in nextBooq will warn you about a failing webhook — Razorpay is the
only place it shows. Check it once now, and again if you ever change your keys.

---

## Refunds

When you cancel a booking that a guest paid for, nextBooq adds it to your
**Refunds owed** list. It does not move any money.

You issue the refund from your own Razorpay dashboard, then come back and
record it against the booking with the refund reference. That keeps a record
of who was paid back and when, which matters if a guest ever asks.

Refunds usually reach the guest within 5–7 business days.

---

## If you change your keys later

Rotating your Razorpay keys is fine, but do the whole sequence in one sitting:

1. Generate the new key in Razorpay
2. Save it in nextBooq — this generates a **new webhook secret**
3. Update the secret on your existing webhook in Razorpay
4. Make a test booking and confirm the delivery log shows 200

Skipping step 3 is the common mistake. Payments will keep working, and the
webhook will fail quietly.

---

## Still stuck?

Email us and we'll walk through it with you. Include your café name and, if
you can, a screenshot of your Razorpay webhook delivery log — that's usually
enough to spot the problem immediately.
