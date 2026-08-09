# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two primary audiences, served by distinct surfaces of the same product:

- **Diners** (customer-facing booking site, in scope for this redesign): people in India booking a table at a specific neighborhood cafe — checking real-time availability for a date/party size, picking a time slot, putting down a small deposit (via Razorpay, in ₹) to hold the table, and later checking or managing that reservation. Mobile-first usage is the realistic default (booking on the go, often last-minute within the cafe's lead-time window).
- **Cafe staff** (host/manager dashboard, out of scope for this redesign): hosts running the live floor during service (checking guests in, seating, marking no-shows) and managers configuring tables and reservation rules. Not touched in this pass.

## Product Purpose

nextBooq is a multi-tenant table-reservation platform for independent cafes. It replaces ad hoc phone-call bookings with a self-serve online flow: a diner sees real live availability for a specific cafe, holds a table, pays a small deposit to confirm commitment, and the cafe runs its floor off a live manifest instead of a notebook. Success on the customer-facing surface means a diner can go from "I want a table" to "I have a confirmed reservation" with no friction, no ambiguity about whether it worked, and no reason to distrust the deposit-hold mechanic (which is the main new/unfamiliar part of this UX compared to a phone booking).

## Positioning

Each cafe is its own tenant with its own branding, operating hours, and reservation rules (party size caps, turn time, lead time, hold duration) — this is not a single generic booking widget skinned per client, it's meant to feel like *that cafe's* booking experience. The deposit-hold mechanic (HOLD → time-boxed countdown → payment → CONFIRMED) is the mechanism a plain calendar-embed competitor doesn't have: it's what lets a small independent cafe actually enforce no-show accountability without staff overhead.

## Operating Context

- India market: currency is ₹ (INR), payments via Razorpay.
- Tenant-scoped URLs (`/{tenant}/...`) — every screen in this surface is branded to one specific cafe, resolved server-side from the tenant slug.
- The booking flow is time-pressured by design: a HOLD expires after a short countdown (cafe-configurable, default ~10 min) if payment isn't completed, and slot availability can change between viewing and confirming (concurrent bookers).
- Auth is lightweight/low-friction for diners — "quick auth" via phone/email + password, not a heavyweight account system, since most diners are booking once and moving on.

## Capabilities and Constraints

- Customer-facing surface in scope for this redesign covers exactly five screens/states, whose fields, API calls, and flow order are fixed by an existing UI spec and must not change in this pass: landing/search + time-slot picker (`/[tenant]`), an auth overlay (login/register inline, not a separate page), checkout/payment (`/[tenant]/checkout`), booking success (`/[tenant]/success`), and reservation history (`/[tenant]/my-reservations`).
- Stack is fixed (existing codebase, not greenfield): Next.js App Router, TypeScript, Tailwind CSS + shadcn/ui only (no custom CSS files, no new component libraries), TanStack React Query for all async/server state, React Hook Form + Zod for forms, HttpOnly-cookie auth (frontend never touches the raw token).
- Multi-tenant theming must be CSS-variable-driven (not hardcoded color utilities), since each cafe can carry its own brand colors on top of the shared design system.
- This redesign pass is visual/UI only — the information architecture, screen set, and field-level requirements are not being reconsidered.

## Brand Commitments

- Product name: nextBooq.
- No fixed brand identity is locked in yet for the customer-facing surface — the existing code has a partial warm palette (terracotta-red, cream, mocha, gold) that this redesign is deliberately building on and systematizing, not discarding. Direction confirmed with the user: cozy Indian-neighborhood-cafe warmth (terracotta/cane/brass/filter-kaapi-adjacent), explicitly not generic Western third-wave-coffeehouse tropes (exposed brick, kraft paper, mason jars).
- Per-tenant override is a real requirement, not aspirational: the shared token system must stay swappable per cafe, even though this pass designs the default theme.

## Evidence on Hand

- `req folder/FrontendUISpecifications&PageBlueprints.pdf` — authoritative field-level spec for every screen in this product, including the customer-facing surface in scope here.
- `req folder/FrontendEngineeringPlaybook&Standards.pdf` — authoritative engineering constraints (styling approach, theming mechanism, state/data rules).
- Existing implementation under `frontend/src/app/[tenant]/(public)/`, `frontend/src/app/[tenant]/checkout/`, `frontend/src/app/[tenant]/success/`, `frontend/src/app/[tenant]/my-reservations/`, and `frontend/src/components/booking/` — treated as incumbent visual evidence (and anti-reference for this redesign per the confirmed direction), not as a locked design.
- No customer testimonials, case studies, or press exist; none should be fabricated.

## Product Principles

1. The deposit-hold mechanic is unfamiliar and time-pressured — the design must make the countdown, the hold status, and "did my booking actually work" legible at every step, not just decorative.
2. Each cafe should feel like it owns its booking page, not like it's renting a generic widget — brand warmth and tenant theming are product requirements, not polish.
3. Mobile-first: most diners will book on a phone, often close to their lead-time window.
4. Visual variety across the five screens comes from one shared token system shifting accent/mood per step, not from divergent, uncoordinated per-page styling.
5. Never redesign around invented data — real field names, real currency (₹), real API shapes from the UI spec are load-bearing, not placeholders.

## Accessibility & Inclusion

No product-specific accessibility standard has been confirmed by the user; standard web accessibility practice (contrast, focus states, semantic markup, touch target sizing for a mobile-first flow) applies by default by way of the `impeccable` craft floor.
