# About Us & Contact Us pages — design spec

## Problem

The marketing site's nav and footer were recently stripped of every dead link (a prior cleanup pass removed placeholder `href="#"` entries for Features, Changelog, About, Blog, Careers, Contact, legal pages, and social icons — see git history around the `MarketingHeader`/`MarketingFooter` cleanup). Two of those — About and Contact — are worth having as real, working pages rather than staying removed, with working navigation to them.

## Scope

In scope: an `/about` page (static company/product content), a `/contact` page with a working contact form that emails the site owner, and navigation entries for both in the header and footer.

Out of scope: any other marketing page (blog, careers, changelog, legal pages) — those stay removed. No admin UI for viewing past contact submissions; the form only sends an email, nothing is persisted to the database.

## Pages

Both pages live under the existing `(control-plane)` route group (`frontend/src/app/(control-plane)/about/page.tsx`, `.../contact/page.tsx`), so they automatically inherit the shared `MarketingHeader`/`MarketingFooter` shell from `(control-plane)/layout.tsx` — no new layout work needed.

**About** (`about/page.tsx`): a static server component, same shape as the homepage (`(control-plane)/page.tsx`) — page `metadata` export plus static JSX content. No client-side interactivity, so (matching this codebase's convention — `LandingHero.tsx` has no test file) it gets no dedicated test.

**Contact** (`contact/page.tsx`): a static server component shell with `metadata`, rendering the new `ContactForm` client component.

## Navigation

`MarketingHeader.tsx` gets its `navLinks` array back (removed in the prior dead-link cleanup), now pointing at real routes:
```typescript
const navLinks = [
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
]
```
Rendered in both the desktop nav (`<nav aria-label="Main navigation">`) and the mobile slide-down menu, exactly where the old array's `.map()` blocks were before removal.

`MarketingFooter.tsx` gets the same two links added next to the existing "Get a demo" link in its top section.

## Contact form → email

**Frontend** — `frontend/src/components/marketing/ContactForm.tsx` (new, `'use client'`): three fields (Name, Email, Message), each required with an inline error state if submitted empty. On submit, POSTs to `/api/v1/contact` via the shared `axiosInstance` (`{ name, email, message }`). Success clears the form and shows a `sonner` toast ("Message sent — we'll get back to you soon."); failure shows the backend's error message via toast, matching the error-handling pattern already used in `PaymentsEditor.tsx` (`err?.response?.data?.message` with a generic fallback). This component gets a test file (`ContactForm.test.tsx`) mirroring `payments-editor.test.tsx`'s structure: renders with empty fields, rejects submission with a field missing, submits successfully and shows the success state, shows the backend's error message on a rejected submission.

**Backend** — a new, non-cafe-scoped, unauthenticated route:

- `backend/src/controllers/public/contactController.js` (new): `submitContactForm(req, res, next)` validates `name` (required, non-empty, ≤200 chars), `email` (required, matches a basic email-shape regex — same validation strictness as other free-text email fields already accepted elsewhere in this codebase, e.g. registration), `message` (required, non-empty, ≤5000 chars), throwing `BadRequestError` on any failure (matching every other controller's validation style in this codebase). On success, calls `emailService.sendContactEmail({ name, email, message })` and responds `200 { status: 'success' }`.

- `backend/src/services/emailService.js`: new `sendContactEmail({ name, email, message })`, structured identically to the existing `sendPasswordResetEmail`/`sendVerificationEmail` — same `if (!config.RESEND_API_KEY) { console.log(...); return { logged: true, ... } }` fallback, same try/catch defense-in-depth around the Resend SDK call, same `{ logged, data, error }` return shape. Sends `from: config.FROM_EMAIL`, `to: config.CONTACT_EMAIL || config.FROM_EMAIL`, `replyTo: email` (the submitter's address, so replying to the notification goes straight to them), with a plain HTML body containing the name, email, and message.

- `backend/src/config/env.js`: new `CONTACT_EMAIL: z.string().optional()` in the schema. Not added to `INSECURE_DEFAULTS` or the production `superRefine` guard — it's not a secret, and its fallback (`config.FROM_EMAIL`) is already guarded as a real address in production by the existing `FROM_EMAIL` production check.

- `backend/src/middleware/rateLimiter.js`: new `contactFormRateLimiter`, modeled on `bookingCreationRateLimiter` — this is an unauthenticated POST that triggers outbound email, so it needs its own abuse guard. Limit: 5 requests per hour per IP (`windowMs: 60 * 60 * 1000, max: 5`), with the message "Too many contact form submissions. Please try again later."

- `backend/src/routes/v1/publicRoutes.js`: `router.post('/contact', contactFormLimiterMiddleware, submitContactForm)`, with the same `NODE_ENV === 'test'` → `noop` bypass already used for `availabilityLimiterMiddleware`/`bookingCreationLimiterMiddleware`, so automated test suites aren't rate-limited.

## Testing

- `backend/tests/integration/contactForm.test.js`: rejects each missing/invalid field individually (empty name, empty/malformed email, empty message, over-length message), accepts a valid submission and returns 200 (with `RESEND_API_KEY` unset in the test environment, exercising the console.log-fallback path — matching how `emailService`'s other two functions are implicitly tested via their calling flows, e.g. password-reset and verification-email integration tests).
- `frontend/src/components/marketing/ContactForm.test.tsx`: per the Contact form section above.
- No test for the static About/Contact page shells themselves, consistent with `LandingHero.tsx` having none.

## Global constraints

- Contact form submissions are never persisted to the database — email is the only record, exactly like the existing password-reset/verification-email flows (which also don't log request bodies beyond what's needed for the email itself).
- The new `/contact` endpoint must be reachable without authentication (a prospective customer contacting the company isn't a logged-in user).
- Follow the existing validation-error style exactly: `BadRequestError` with a message specific enough to name the offending field, matching every other controller in this codebase (e.g. `cafeController.js`'s `validateMenuInput`).
