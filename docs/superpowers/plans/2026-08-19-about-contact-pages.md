# About Us & Contact Us Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a static About Us page, a working Contact Us page (form that emails the site owner), and navigation to both from the header and footer.

**Architecture:** Two new pages under the existing `(control-plane)` route group (which already wraps every page with the shared `MarketingHeader`/`MarketingFooter`). The contact form posts to a new unauthenticated, rate-limited backend endpoint that reuses the existing Resend-based email service pattern (same gate-and-console.log-fallback shape as the password-reset/verification-email flows already in this codebase).

**Tech Stack:** Next.js App Router (frontend), Express + Zod (backend config), Resend (email), Vitest (frontend tests), Jest + Supertest (backend tests).

## Global Constraints

- Contact form submissions are never persisted to the database — email is the only record.
- The `/contact` endpoint must be reachable without authentication.
- Validation errors use `BadRequestError` with a message naming the offending field, matching every other controller in this codebase.
- `CONTACT_EMAIL` (new env var) is NOT added to `INSECURE_DEFAULTS` or the production `superRefine` guard — it's not a secret, and its fallback (`FROM_EMAIL`) is already guarded as a real address in production.
- The About page gets no dedicated test file — matches this codebase's convention of not testing purely static, non-interactive marketing content (`LandingHero.tsx` has none either).

---

### Task 1: Backend — `POST /api/v1/contact` endpoint

**Files:**
- Modify: `backend/src/config/env.js`
- Modify: `backend/src/services/emailService.js`
- Modify: `backend/src/middleware/rateLimiter.js`
- Create: `backend/src/controllers/public/contactController.js`
- Modify: `backend/src/routes/v1/publicRoutes.js`
- Test: `backend/tests/integration/contactForm.test.js`

**Interfaces:**
- Produces: `sendContactEmail({ name, email, message }): Promise<{ logged, data, error }>` — exported from `emailService.js`, same return shape as the existing `sendPasswordResetEmail`/`sendVerificationEmail`.
- Produces: `submitContactForm(req, res, next)` — exported from `contactController.js`.
- Produces: `contactFormRateLimiter` — exported from `rateLimiter.js` alongside the existing three limiters.
- Produces: `POST /api/v1/contact` accepting `{ name: string, email: string, message: string }`, returning `200 { status: 'success' }` on success or `400` (via the existing error-handling middleware) on validation failure.

- [ ] **Step 1: Add `CONTACT_EMAIL` to the env schema**

In `backend/src/config/env.js`, add this line to the schema object, right after the `FROM_EMAIL` line:

```javascript
    // Recipient for the "Contact Us" form's emails. Defaults to FROM_EMAIL's
    // own address when unset, so the form works out of the box without a
    // separate config value — override this if you want contact submissions
    // routed somewhere other than the sender identity.
    CONTACT_EMAIL: z.string().optional(),
```

Do not add `CONTACT_EMAIL` to `INSECURE_DEFAULTS` or the `superRefine` production guard — it isn't a secret and its fallback is already validated.

- [ ] **Step 2: Write the failing integration test**

```javascript
// backend/tests/integration/contactForm.test.js
const request = require('supertest');
const app = require('../../src/app');
const { setupTestDB } = require('../setup');

jest.mock('../../src/services/emailService', () => ({
  sendContactEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
}));
const { sendContactEmail } = require('../../src/services/emailService');

setupTestDB();

describe('Contact form submission', () => {
  beforeEach(() => {
    sendContactEmail.mockClear();
  });

  test('accepts a valid submission and calls the email service', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      name: 'Jane Doe',
      email: 'jane@example.com',
      message: 'Hello, I would like to know more about nextBooq.',
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(sendContactEmail).toHaveBeenCalledTimes(1);
    expect(sendContactEmail).toHaveBeenCalledWith({
      name: 'Jane Doe',
      email: 'jane@example.com',
      message: 'Hello, I would like to know more about nextBooq.',
    });
  });

  test('rejects a missing name with 400 and does not call the email service', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      email: 'jane@example.com',
      message: 'Hello there.',
    });

    expect(res.status).toBe(400);
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  test('rejects a missing or malformed email with 400', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      name: 'Jane Doe',
      email: 'not-an-email',
      message: 'Hello there.',
    });

    expect(res.status).toBe(400);
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  test('rejects a missing message with 400', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      name: 'Jane Doe',
      email: 'jane@example.com',
    });

    expect(res.status).toBe(400);
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  test('rejects a message over 5000 characters with 400', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      name: 'Jane Doe',
      email: 'jane@example.com',
      message: 'a'.repeat(5001),
    });

    expect(res.status).toBe(400);
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  test('rejects a name over 200 characters with 400', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      name: 'a'.repeat(201),
      email: 'jane@example.com',
      message: 'Hello there.',
    });

    expect(res.status).toBe(400);
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  test('trims whitespace and lowercases the email before passing it to the email service', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      name: '  Jane Doe  ',
      email: '  JANE@EXAMPLE.COM  ',
      message: '  Hello there.  ',
    });

    expect(res.status).toBe(200);
    expect(sendContactEmail).toHaveBeenCalledWith({
      name: 'Jane Doe',
      email: 'jane@example.com',
      message: 'Hello there.',
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && npx jest tests/integration/contactForm.test.js`
Expected: FAIL — `POST /api/v1/contact` doesn't exist yet (all requests 404).

- [ ] **Step 4: Add `sendContactEmail` to the email service**

In `backend/src/services/emailService.js`, add this function (following the exact shape of the two existing functions in the file) and update the final `module.exports`:

```javascript
const sendContactEmail = async ({ name, email, message }) => {
  const recipient = config.CONTACT_EMAIL || config.FROM_EMAIL;

  if (!config.RESEND_API_KEY) {
    console.log(
      `[emailService] RESEND_API_KEY not set — logging contact form submission instead of sending. from=${name} <${email}> to=${recipient}`
    );
    return { logged: true, data: null, error: null };
  }

  const resend = new Resend(config.RESEND_API_KEY);

  try {
    const { data, error } = await resend.emails.send({
      from: config.FROM_EMAIL,
      to: recipient,
      replyTo: email,
      subject: `New contact form message from ${name}`,
      html: `
        <p><strong>From:</strong> ${name} (${email})</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
      `,
    });

    if (error) {
      console.error('[emailService] Failed to send contact form email:', error);
    }

    return { logged: false, data, error };
  } catch (err) {
    console.error('[emailService] Failed to send contact form email:', err);
    return { logged: false, data: null, error: { message: err.message } };
  }
};

module.exports = { sendPasswordResetEmail, sendVerificationEmail, sendContactEmail };
```

- [ ] **Step 5: Add the rate limiter**

In `backend/src/middleware/rateLimiter.js`, add this limiter and update the `module.exports` at the bottom of the file:

```javascript
// Unauthenticated POST that triggers an outbound email on every request —
// without a limiter, this is a cheap way to spam the configured recipient's
// inbox (and burn Resend send quota) from a single IP.
const contactFormRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many contact form submissions. Please try again later.',
});

module.exports = { authRateLimiter, availabilityRateLimiter, bookingCreationRateLimiter, contactFormRateLimiter };
```

- [ ] **Step 6: Implement the controller**

```javascript
// backend/src/controllers/public/contactController.js
const { sendContactEmail } = require('../../services/emailService');
const { BadRequestError } = require('../../utils/errors');

const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const submitContactForm = async (req, res, next) => {
  try {
    const { name, email, message } = req.body;

    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new BadRequestError('Name is required');
    }
    if (name.trim().length > 200) {
      throw new BadRequestError('Name must be 200 characters or fewer');
    }

    if (typeof email !== 'string' || !EMAIL_FORMAT_REGEX.test(email.trim())) {
      throw new BadRequestError('A valid email address is required');
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
      throw new BadRequestError('Message is required');
    }
    if (message.trim().length > 5000) {
      throw new BadRequestError('Message must be 5000 characters or fewer');
    }

    await sendContactEmail({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      message: message.trim(),
    });

    res.status(200).json({ status: 'success' });
  } catch (error) {
    next(error);
  }
};

module.exports = { submitContactForm };
```

- [ ] **Step 7: Wire the route**

In `backend/src/routes/v1/publicRoutes.js`:

Change this import line:
```javascript
const { availabilityRateLimiter, bookingCreationRateLimiter } = require('../../middleware/rateLimiter');
```
to:
```javascript
const { availabilityRateLimiter, bookingCreationRateLimiter, contactFormRateLimiter } = require('../../middleware/rateLimiter');
```

Add this import alongside the other controller imports:
```javascript
const { submitContactForm } = require('../../controllers/public/contactController');
```

Add this line alongside the other `...LimiterMiddleware` declarations:
```javascript
const contactFormLimiterMiddleware = config.NODE_ENV === 'test' ? noop : contactFormRateLimiter;
```

Add this route (placed near the top, alongside the other routes with no `:cafeId` param — e.g. right after the `router.get('/cafes/slug/:slug', getCafeBySlug);` line):
```javascript
// Contact Us form submission (Public, unauthenticated)
router.post('/contact', contactFormLimiterMiddleware, submitContactForm);
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd backend && npx jest tests/integration/contactForm.test.js`
Expected: PASS, 7 tests

- [ ] **Step 9: Run the full backend suite**

Run: `cd backend && npm test`
Expected: All passing. If any test unexpectedly fails, re-run just that file with `--runInBand` before assuming it's a real regression (this project has a known flaky-under-parallel-load pattern for unrelated tests).

- [ ] **Step 10: Commit**

```bash
git add backend/src/config/env.js backend/src/services/emailService.js backend/src/middleware/rateLimiter.js backend/src/controllers/public/contactController.js backend/src/routes/v1/publicRoutes.js backend/tests/integration/contactForm.test.js
git commit -m "feat: add POST /api/v1/contact endpoint for the Contact Us form"
```

---

### Task 2: Frontend — `ContactForm` component and `/contact` page

**Files:**
- Create: `frontend/src/components/marketing/ContactForm.tsx`
- Test: `frontend/src/components/marketing/ContactForm.test.tsx`
- Create: `frontend/src/app/(control-plane)/contact/page.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/contact` (Task 1) — body `{ name, email, message }`, success `200 { status: 'success' }`, failure `4xx { status: 'fail', message: string }` (matching the existing error-response shape every other controller in this codebase uses, read by the frontend via `err?.response?.data?.message`, same pattern as `PaymentsEditor.tsx`).
- Produces: `ContactForm` — a self-contained component with no props, used by `frontend/src/app/(control-plane)/contact/page.tsx`.

- [ ] **Step 1: Write the failing component test**

```typescript
// frontend/src/components/marketing/ContactForm.test.tsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ContactForm } from './ContactForm';
import { axiosInstance } from '@/hooks/api/axios-instance';

vi.mock('@/hooks/api/axios-instance', () => ({
  axiosInstance: { post: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('ContactForm', () => {
  test('renders empty Name, Email, and Message fields', () => {
    render(<ContactForm />);

    expect(screen.getByLabelText(/name/i)).toHaveValue('');
    expect(screen.getByLabelText(/email/i)).toHaveValue('');
    expect(screen.getByLabelText(/message/i)).toHaveValue('');
  });

  test('shows an inline error and does not submit when a field is left blank', async () => {
    render(<ContactForm />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Jane Doe' } });
    // Email and Message left blank.
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByText(/fill in every field/i)).toBeInTheDocument();
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  test('submits the form and shows a success state, clearing the fields', async () => {
    vi.mocked(axiosInstance.post).mockResolvedValue({ data: { status: 'success' } });

    render(<ContactForm />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: 'Hello there.' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() =>
      expect(axiosInstance.post).toHaveBeenCalledWith('/api/v1/contact', {
        name: 'Jane Doe',
        email: 'jane@example.com',
        message: 'Hello there.',
      })
    );

    await waitFor(() => expect(screen.getByLabelText(/name/i)).toHaveValue(''));
    expect(screen.getByLabelText(/email/i)).toHaveValue('');
    expect(screen.getByLabelText(/message/i)).toHaveValue('');
  });

  test('shows the backend error message when submission fails', async () => {
    vi.mocked(axiosInstance.post).mockRejectedValue({
      response: { data: { message: 'A valid email address is required' } },
    });

    render(<ContactForm />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: 'Hello there.' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() =>
      expect(screen.getByText(/a valid email address is required/i)).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/marketing/ContactForm.test.tsx`
Expected: FAIL — `./ContactForm` doesn't exist yet.

- [ ] **Step 3: Implement `ContactForm`**

```typescript
// frontend/src/components/marketing/ContactForm.tsx
'use client';

import { useState, FormEvent } from 'react';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';

export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim() || !message.trim()) {
      setError('Please fill in every field.');
      return;
    }

    setIsSending(true);
    try {
      await axiosInstance.post('/api/v1/contact', { name, email, message });
      toast.success("Message sent — we'll get back to you soon.");
      setName('');
      setEmail('');
      setMessage('');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to send your message. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg mx-auto">
      <div>
        <label htmlFor="contact-name" className="block text-sm font-semibold text-brand-brown mb-1.5">
          Name
        </label>
        <input
          id="contact-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm"
        />
      </div>

      <div>
        <label htmlFor="contact-email" className="block text-sm font-semibold text-brand-brown mb-1.5">
          Email
        </label>
        <input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm"
        />
      </div>

      <div>
        <label htmlFor="contact-message" className="block text-sm font-semibold text-brand-brown mb-1.5">
          Message
        </label>
        <textarea
          id="contact-message"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm"
        />
      </div>

      {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={isSending}
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-red px-5 py-2.5 text-sm font-semibold text-white shadow-brand-sm transition-colors hover:bg-brand-redDark disabled:opacity-50"
      >
        {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        Send message
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/marketing/ContactForm.test.tsx`
Expected: PASS, 4 tests

- [ ] **Step 5: Create the Contact page**

```tsx
// frontend/src/app/(control-plane)/contact/page.tsx
import type { Metadata } from 'next'
import { ContactForm } from '@/components/marketing/ContactForm'

export const metadata: Metadata = {
  title: 'Contact Us — nextBooq',
  description: 'Get in touch with the nextBooq team — questions, feedback, or partnership inquiries.',
}

export default function ContactPage() {
  return (
    <main className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto text-center">
      <h1 className="font-display text-4xl sm:text-5xl font-black text-brand-brown mb-4">
        Get in Touch
      </h1>
      <p className="text-brand-mocha text-base sm:text-lg mb-10 max-w-xl mx-auto">
        Questions about nextBooq, feedback on your experience, or interested in bringing it to your café?
        Send us a message and we&apos;ll get back to you.
      </p>
      <ContactForm />
    </main>
  )
}
```

(The `pt-32` top padding clears the fixed `MarketingHeader` — `MarketingHeader` uses `fixed top-0 ... h-16 md:h-20`, so top-anchored content needs explicit top padding to avoid rendering underneath it. `auth/login/page.tsx` sidesteps this with `min-h-screen flex items-center justify-center` instead, which isn't applicable here since this page's content should read top-down, not sit vertically centered.)

- [ ] **Step 6: Type-check and run the frontend suite**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: Type-check clean; all tests passing (including the 4 new ones).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/marketing/ContactForm.tsx frontend/src/components/marketing/ContactForm.test.tsx "frontend/src/app/(control-plane)/contact/page.tsx"
git commit -m "feat: add Contact Us page with a working contact form"
```

---

### Task 3: Frontend — `/about` page

**Files:**
- Create: `frontend/src/app/(control-plane)/about/page.tsx`

**Interfaces:**
- Produces: a static page at `/about`, no exported interface (nothing else in this plan imports from this file — Task 4 only needs to know the route path `/about`, not any component from it).

- [ ] **Step 1: Create the About page**

```tsx
// frontend/src/app/(control-plane)/about/page.tsx
import type { Metadata } from 'next'
import { Coffee, Heart, Sparkles } from 'lucide-react'

export const metadata: Metadata = {
  title: 'About Us — nextBooq',
  description: 'nextBooq powers seamless reservations and unforgettable guest experiences for cafés and restaurants everywhere.',
}

const values = [
  {
    icon: Coffee,
    title: 'Built for cafés',
    description: 'Every feature is designed around how a real café actually runs — table holds, walk-ins, and turn times that shift by the hour.',
  },
  {
    icon: Sparkles,
    title: 'Instant, reliable bookings',
    description: 'Real-time table allocation means guests get an immediate answer, and owners never overbook a table twice.',
  },
  {
    icon: Heart,
    title: 'Guest experience first',
    description: 'A smooth reservation is the first impression of a great visit — we obsess over making that first moment effortless.',
  },
]

export default function AboutPage() {
  return (
    <main className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
      <div className="text-center mb-16">
        <h1 className="font-display text-4xl sm:text-5xl font-black text-brand-brown mb-4">
          About nextBooq
        </h1>
        <p className="text-brand-mocha text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
          nextBooq is the all-in-one reservation platform for modern cafés and restaurants — built to simplify
          bookings for owners and delight guests from the first tap to the last sip.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
        {values.map(({ icon: Icon, title, description }) => (
          <div key={title} className="text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-brand-red/10 flex items-center justify-center">
              <Icon className="w-6 h-6 text-brand-red" />
            </div>
            <h2 className="font-display text-lg font-bold text-brand-brown">{title}</h2>
            <p className="text-sm text-brand-mocha leading-relaxed">{description}</p>
          </div>
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: Clean, no errors.

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/app/(control-plane)/about/page.tsx"
git commit -m "feat: add About Us page"
```

---

### Task 4: Frontend — Navigation wiring (header + footer)

**Files:**
- Modify: `frontend/src/components/marketing/MarketingHeader.tsx`
- Modify: `frontend/src/components/marketing/MarketingFooter.tsx`

**Interfaces:**
- Consumes: `/about` (Task 3) and `/contact` (Task 2) route paths — no component-level import, just `href` strings.

- [ ] **Step 1: Restore the desktop and mobile nav in `MarketingHeader.tsx`**

Add this above `export default function MarketingHeader() {`:

```typescript
const navLinks = [
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
]
```

Insert this block between the Logo `<Link>` and the `{/* Desktop CTA */}` comment (i.e. immediately before `<div className="hidden md:flex items-center gap-3">`):

```tsx
          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8" aria-label="Main navigation">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-brand-mocha hover:text-brand-brown font-medium text-sm transition-colors relative group"
              >
                {link.label}
                <span className="absolute -bottom-0.5 left-0 w-0 h-0.5 bg-brand-red rounded-full transition-all duration-200 group-hover:w-full" />
              </Link>
            ))}
          </nav>

```

In the mobile slide-down menu, change:
```tsx
            <nav className="flex flex-col px-4 py-4 gap-4" aria-label="Mobile navigation">
              <div className="flex flex-col gap-3">
```
to:
```tsx
            <nav className="flex flex-col px-4 py-4 gap-4" aria-label="Mobile navigation">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-brand-mocha hover:text-brand-brown font-medium text-base py-1 transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex flex-col gap-3 pt-2 border-t border-brand-tan">
```

- [ ] **Step 2: Add the links to `MarketingFooter.tsx`**

Change:
```tsx
          <Link
            href="/auth/register"
            className="text-sm font-semibold text-white hover:text-brand-redLight transition-colors"
          >
            Get a demo
          </Link>
```
to:
```tsx
          <div className="flex flex-col sm:items-end gap-3">
            <Link href="/about" className="text-sm text-white/60 hover:text-white transition-colors">
              About
            </Link>
            <Link href="/contact" className="text-sm text-white/60 hover:text-white transition-colors">
              Contact
            </Link>
            <Link
              href="/auth/register"
              className="text-sm font-semibold text-white hover:text-brand-redLight transition-colors"
            >
              Get a demo
            </Link>
          </div>
```

- [ ] **Step 3: Type-check and run the frontend suite**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: Type-check clean; all tests passing (no test file directly covers `MarketingHeader`/`MarketingFooter`, so this step is verifying no other test broke).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/marketing/MarketingHeader.tsx frontend/src/components/marketing/MarketingFooter.tsx
git commit -m "feat: add About and Contact links to the header and footer navigation"
```

---
