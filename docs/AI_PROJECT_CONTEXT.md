# nextBooq — AI Project Context

Use this document as the working brief for AI assistants contributing to this repository. It describes the current implementation as of 2026-08-15. When this document conflicts with source code, the source code is authoritative.

## What this product is

nextBooq is a multi-tenant SaaS table-reservation platform for independent cafes, aimed at the India market.

It has three distinct product surfaces:

1. **Customer booking portal** — a tenant-branded, mobile-first flow where diners choose a party size, date, and available time; create a short-lived hold; pay a refundable INR deposit through Razorpay; and view prior reservations.
2. **Cafe staff dashboard** — a tenant-scoped operational surface for hosts and managers to run the reservation manifest, seat guests, manage tables, and configure cafe rules.
3. **nextBooq platform administration** — a separate, top-level internal surface for managing organizations, cafe subscriptions, and subscription states.

The core value proposition is not simply online booking. It is the enforced reservation lifecycle: a customer holds a real table allocation, pays before the hold expires, and staff run service from a live, real-time manifest rather than a notebook.

## Product vocabulary

| Term | Meaning |
| --- | --- |
| Tenant / cafe | One independent cafe using the platform. URLs are scoped as `/{tenant}` where `tenant` is the cafe slug. |
| Organization | The business entity that owns one or more cafes. |
| Customer / diner | A person making bookings. Customer accounts do not have a special database role. |
| Staff membership | A user's per-cafe authorization record, containing `cafe_id`, a staff role, and permissions. |
| Platform admin | A separate cross-tenant flag (`is_platform_admin`), not a staff membership role. |
| Hold | A temporary reservation allocation that blocks tables while payment is pending. |
| Reservation | A booking with a strict state machine, assigned table(s), a customer, and payment data. |
| Table merge | A connected group of up to three tables that can be combined to fit a larger party. |

## Tech stack and repository layout

```text
nextBooq/
├── frontend/                 Next.js 15 App Router application
│   ├── src/app/              Route pages and layouts
│   ├── src/components/       UI, booking, dashboard, admin, and providers
│   ├── src/hooks/            React Query data hooks
│   ├── src/store/            Zustand client workflow state
│   └── src/lib/              types, guards, theme, time, and pure helpers
├── backend/                  Express 5 + MongoDB/Mongoose API
│   ├── src/routes/           REST API composition
│   ├── src/controllers/      HTTP orchestration
│   ├── src/services/         domain/business logic
│   ├── src/models/           Mongoose schemas
│   └── tests/                Jest unit, integration, and lifecycle tests
├── docs/                     Design specs, plans, and this briefing
├── PRODUCT.md                Product intent and customer UX scope
└── AUDIT_AND_WORKPLAN.md     Historical audit; items recorded as resolved
```

Frontend: TypeScript, React 19, Next.js 15, Tailwind CSS, shadcn/Radix UI, TanStack React Query, Zustand, React Hook Form/Zod, Axios, Socket.IO client, date-fns, Razorpay Checkout.

Backend: Node/CommonJS, Express, MongoDB/Mongoose, JWT in HTTP-only cookies, Socket.IO, Razorpay, Zod, Helmet, CORS, and express-rate-limit.

## URLs and pages

Route groups in parentheses do not appear in URLs.

| URL | Audience | Purpose | Protection |
| --- | --- | --- | --- |
| `/` | Everyone | nextBooq marketing home | Public |
| `/pricing` | Everyone | SaaS pricing | Public |
| `/auth/login` | Cafe staff / platform admin | Email-password operator login | Public |
| `/auth/register` | New cafe owner | Create account then start onboarding | Public |
| `/onboarding` | New cafe owner | Create organization, cafe, slug, and subscription selection | Requires a valid session cookie |
| `/admin` | nextBooq internal team | Organization and subscription administration | Session + `is_platform_admin` |
| `/{tenant}` | Customer | Tenant-branded booking landing page | Public |
| `/{tenant}/checkout` | Customer | Pay the reservation deposit | Public route; depends on in-memory booking state |
| `/{tenant}/success` | Customer | Confirmed reservation/token and calendar download | Public route; depends on in-memory booking state |
| `/{tenant}/my-reservations` | Customer | Reservation history and resume pending payment | Authentication is required only to retrieve bookings |
| `/{tenant}/dashboard` | Cafe staff | Host Stand; live manifest and floor plan | Valid session + staff membership for that cafe |
| `/{tenant}/reservations` | Cafe staff | Search/filter reservation history | Valid session + staff membership + API permission |
| `/{tenant}/tables` | Cafe staff | Add/edit/retire tables and merges | Valid session + staff membership + `edit_tables` API permission |
| `/{tenant}/settings` | Cafe staff | Reservation rules and operating hours | Valid session + staff membership + `edit_settings` API permission |
| unknown route | Everyone | Next.js 404 page | N/A |

The `/{tenant}` layout resolves the cafe from its slug on the server, puts its brand colors into CSS variables, and returns a 404 for an unknown or deleted cafe.

## Roles, permissions, and access control

### Staff roles

Each `staff_memberships` record has one of these roles:

- `owner` — automatically receives all permissions.
- `manager`
- `host`
- `staff`

Non-owners require explicit permissions in their membership:

- `manage_staff`
- `edit_tables`
- `edit_settings`
- `view_reservations`
- `edit_reservations`
- `cancel_reservations`
- `manage_billing`

The backend is the authority: it resolves the cafe from the request, looks up the membership for that cafe, and rejects a missing permission. The dashboard's client-side membership test is only defense-in-depth.

### Platform admin

`User.is_platform_admin` is a separate boolean for nextBooq's internal, cross-tenant operator. It gates `/admin` client-side and every `/api/v1/platform-admin/*` endpoint server-side. It is intentionally not settable through ordinary HTTP endpoints; the repository includes a one-off grant script.

### Login routing as currently implemented

1. Staff login posts email/password to `/api/v1/auth/login`.
2. The backend validates bcrypt password, writes the `accessToken` HTTP-only cookie (JWT; seven-day expiry), audits the login, and returns user details plus populated staff memberships.
3. If the login URL has `callbackUrl`, the frontend redirects there first.
4. Otherwise, if the returned user has a first staff membership whose cafe has a slug, the frontend redirects to `/{slug}/dashboard`.
5. Otherwise it redirects to `/onboarding`.

Important current behavior: the login response returns staff memberships but **does not return `is_platform_admin`**. Consequently a platform admin with no staff membership lands on `/onboarding` after a normal login rather than `/admin`. Visiting `/admin` through a callback works because the later `/auth/me` response does contain the flag.

### Route protection

Next middleware protects staff dashboard patterns and `/admin` only by requiring an unexpired cookie. It redirects missing/expired sessions to `/auth/login?callbackUrl=...`. It does not make an authorization decision. Tenant membership and permissions are then enforced by client checks and, authoritatively, the API middleware.

## Customer booking flow

1. Customer opens `/{tenant}`. The server loads the cafe and applies tenant theme variables.
2. Customer selects party size, date, and a time. Availability requests are fresh and query `/api/v1/cafes/:cafeId/available-slots`.
3. The backend generates times from that cafe's operating hours and runs table allocation for each candidate slot.
4. Choosing a time opens an inline authentication dialog. An existing authenticated user continues directly; a new customer uses quick auth with name, email, phone, and a password of at least eight characters.
5. The portal calls `POST /api/v1/cafes/:cafeId/reservations`. The backend validates party size, cafe maximum, lead time, duration, deposit amount, operating hours, duplicate customer overlap, availability, and subscription state.
6. A transactional booking service creates a `HOLD`, assigns the best table or merge, and establishes `hold_expires_at`. It then creates a Razorpay order and moves the reservation to `PENDING_PAYMENT`, setting a payment expiry.
7. The frontend saves reservation/order/expiry information in the Zustand booking store and goes to `/{tenant}/checkout`.
8. Razorpay Checkout returns payment identifiers and a signature. The frontend verifies them with `POST /api/v1/cafes/:cafeId/reservations/:reservationId/verify-payment` before showing success.
9. Valid payment moves `PENDING_PAYMENT → CONFIRMED`. The Razorpay webhook independently verifies payment and is idempotent, so it can confirm the same reservation or safely handle races.
10. `/{tenant}/success` shows a short token derived from the reservation ID and can download an `.ics` calendar event.
11. `/{tenant}/my-reservations` fetches all the current user's reservations. A `PENDING_PAYMENT` reservation can hydrate the booking store and resume checkout.

### Booking constraints and allocation

- Each cafe defines default turn time, maximum party size, booking lead time, hold duration, payment timeout, operating hours, and subscription state.
- Overlap is `[start_time, end_time)`. Active statuses block inventory: `HOLD`, `PENDING_PAYMENT`, `CONFIRMED`, `CHECKED_IN`, and `SEATED`; an expired `HOLD` no longer blocks.
- One user cannot create an overlapping active reservation at the same cafe.
- Allocation prefers the smallest single active table that fits. If no single table works, it finds connected merge combinations of up to three tables.
- Merge candidates are sorted deterministically: least excess capacity, then fewest tables, then lowest table number.
- Production booking uses MongoDB transactions and touches chosen table versions to force write conflicts on concurrency. A standalone MongoDB fallback exists but is non-transactional.
- The server sweeps expired holds and pending payments once per minute, transitioning them to `EXPIRED` so inventory is released.
- Booking and availability are rate limited outside test mode: 10 booking creations/hour and 30 availability requests/minute per client.

## Reservation lifecycle

```text
HOLD → PENDING_PAYMENT → CONFIRMED → CHECKED_IN → SEATED → COMPLETED
                              │              └──────────→ SEATED
                              ├──────────────→ CANCELLED
                              └──────────────→ EXPIRED

HOLD → EXPIRED or CANCELLED
PENDING_PAYMENT → EXPIRED or CANCELLED
CHECKED_IN → LEFT_BEFORE_SEATING
CONFIRMED → NO_SHOW

COMPLETED, CANCELLED, EXPIRED, NO_SHOW, LEFT_BEFORE_SEATING are terminal.
```

Every transition validates the allowed transition matrix, uses optimistic concurrency (`__v`), appends status history, writes the appropriate timestamp, and emits a Socket.IO `reservation_updated` event to the cafe room. `COMPLETED` increments that cafe customer's visit count; `NO_SHOW` increments their no-show count.

When a host attempts seating, the backend also detects physical occupancy conflicts from another `SEATED` reservation. It can supply a conservative alternative-table suggestion that avoids both schedule conflicts and currently occupied tables.

## Staff dashboard behavior

The tenant dashboard uses a shared shell with four navigation entries:

- **Host Stand** — date-selectable daily manifest, cover metrics, floor plan, reservation drawer, and status transitions.
- **Reservations** — date, guest, and status-filtered reservation history.
- **Tables Inventory** — table creation/editing, capacities, active/out-of-service status, soft delete, and valid adjacent merge relationships.
- **Cafe Settings** — operating hours and reservation rules.

On entering a dashboard route, the app fetches `/auth/me`; it verifies the user has a membership for that tenant and redirects unauthorized users to login. It then requests a short-lived socket token, opens Socket.IO, and asks to join the cafe room. Socket authentication validates the JWT and verifies the user has staff membership before room join.

The navigation is not permission-aware: a staff member may see all four pages, while the underlying API returns `403` for actions they are not allowed to perform.

## Platform admin behavior

`/admin` presents aggregated counts (organizations, cafes, renewal attention, and revenue), a cafe/organization table, and a subscription detail drawer.

Platform admin endpoints can:

- retrieve overview counts;
- list organizations with non-deleted cafes and each cafe's current subscription;
- retrieve a cafe's subscription history;
- record a new subscription term; and
- set the current subscription status.

A renewal preserves history: the old current subscription gets `is_current: false`, a new active record is inserted, and the cafe's `subscription_status` is synchronized. The hourly subscription sweep changes an active current subscription whose period has ended to `past_due`.

## Data model

| Model | Key fields and rules |
| --- | --- |
| `User` | `name`, unique lowercased `email`, unique `phone`, `password_hash`, `staff_memberships[]`, `is_platform_admin`. |
| `Organization` | `name`, optional legacy `stripe_customer_id`. |
| `Cafe` | `org_id`, unique lowercase `slug`, `name`, `timezone`, reservation rules, operating hours, subscription status, soft-delete flag. |
| `Table` | `cafe_id`, `table_number`, `capacity`, adjacent `can_merge_with[]`, `active/out_of_service`, soft-delete flag, version. Unique table number is scoped by cafe and deletion state. |
| `Reservation` | immutable cafe/customer/time/party fields, assigned `table_ids[]`, tenant timezone, hold expiry, status, status history, lifecycle timestamps, payment data, version. |
| `CafeCustomer` | unique cafe/customer pair, visit count, no-show count, private staff notes. |
| `Subscription` | organization/cafe, term (1/6/12/18 months), monthly price, period, state (`trial/active/past_due/inactive`), current-vs-history flag, admin author, note. |
| `AuditLog` | Records authentication, failures, writes, and rate-limit events; inspect its schema/controller when changing audit behavior. |

## REST API map

All API endpoints are mounted below `/api/v1` unless noted.

### Authentication

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | Create a normal user and session. |
| POST | `/auth/login` | Staff/operator email-password login. |
| POST | `/auth/customer-quick-auth` | Create or authenticate a customer inline during booking. |
| GET | `/auth/me` | Return session user, memberships, and `is_platform_admin`. |
| POST | `/auth/logout` | Clear browser session cookie. |
| GET | `/auth/socket-token` | Return transient socket JWT for an authenticated user. |

### Public/customer API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/cafes/slug/:slug` | Resolve a public tenant cafe. |
| GET | `/cafes/:cafeId/available-slots?date&partySize[&time&durationMinutes]` | Query availability. |
| POST | `/cafes/:cafeId/reservations` | Create allocation hold and Razorpay order; authenticated customer required. |
| POST | `/cafes/:cafeId/reservations/:reservationId/verify-payment` | Verify Razorpay checkout signature and confirm. |
| GET | `/customer/reservations` | Current customer's bookings. |

### Cafe staff API

| Method | Path | Required permission | Purpose |
| --- | --- | --- | --- |
| POST | `/cafes` | Authenticated user | Create organization/cafe and make creator owner. |
| PUT | `/cafes/:cafeId` | `edit_settings` | Update cafe configuration. |
| GET | `/cafes/:cafeId/reservations` | `view_reservations` | Daily manifest. |
| PUT | `/cafes/:cafeId/reservations/:resId/status` | `edit_reservations` or `cancel_reservations` | Transition a reservation. |
| GET/POST | `/cafes/:cafeId/tables` | `edit_tables` | List/create tables. |
| PUT | `/cafes/:cafeId/tables/:tableId` | `edit_tables` | Edit, retire, or soft-delete a table. |

### Platform admin and webhook API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/webhooks/razorpay` | Razorpay-signed, raw-body verified payment webhook. |
| GET | `/api/v1/platform-admin/overview` | Cross-tenant totals. |
| GET | `/api/v1/platform-admin/orgs` | Organizations with cafes/subscriptions. |
| GET | `/api/v1/platform-admin/cafes/:cafeId/subscriptions` | Subscription history. |
| POST | `/api/v1/platform-admin/cafes/:cafeId/subscriptions` | Record a subscription term. |
| PATCH | `/api/v1/platform-admin/cafes/:cafeId/subscriptions/status` | Change current subscription state. |

## Client state and data flow

- **React Query** owns remote/server data: session user, tenant availability, customer reservations, daily manifest, tables, settings, and admin data.
- **Zustand booking store** owns the in-progress booking: tenant cafe, party size, date, selected time, hold expiry, and Razorpay/reservation response. Checkout and success rely on this store, so a direct refresh before the data is rehydrated can lose context.
- **Zustand dashboard store** owns local dashboard UI state such as selected date and active drawer/selection state.
- Both stores reset on logout and when the tenant changes to avoid shared-browser leakage.
- Axios uses a relative `/api` base path; Next.js rewrites those requests to the backend, keeping the browser's HTTP-only session cookie same-origin for middleware and API calls.
- A global Axios interceptor clears cached session data on `401`; it redirects to staff login only for staff dashboard/admin paths, shows permission errors for `403`, and handles optimistic concurrency conflicts (`409`).

## Security and operational rules

- JWTs are never put in browser storage. Browser sessions use `accessToken`, an HTTP-only, `SameSite=Lax` cookie; non-browser clients may use a Bearer token.
- Production requires a 32+ character JWT secret and non-default Razorpay credentials/secrets.
- CORS accepts only configured `CORS_ALLOWED_ORIGINS`; Express proxy trust is configured through `TRUST_PROXY`.
- Razorpay webhooks verify HMAC over the exact original request bytes and use timing-safe comparison.
- Razorpay client checkout verification is an authoritative backend signature check; the browser callback itself is insufficient proof.
- Tenant resolution excludes soft-deleted cafes. Staff permissions are always tenant-scoped.
- Subscriptions in `inactive` or `past_due` block relevant cafe write/booking operations.
- API errors are shaped by a global error handler. Preserve its response format when adding endpoints.

## Development commands

```text
Frontend: cd frontend
  npm run dev
  npm run type-check
  npm test
  npm run build

Backend: cd backend
  npm run dev
  npm test
  npm run seed
```

MongoDB must be configured through `MONGO_URI`. The backend defaults to port 5000; the frontend uses `NEXT_PUBLIC_API_URL` or `http://localhost:5000`. Environment validation fails fast for unsafe production values.

## Engineering rules for future AI changes

1. Preserve tenant isolation. Every cafe-specific server operation must resolve the tenant and authorize against the membership for that exact cafe.
2. Treat the reservation state machine as a domain boundary. Add transitions only by updating the allowed matrix, status history, timestamps, optimistic concurrency, and tests.
3. Do not bypass allocation. New bookings must go through the hold/allocation service so overlaps, table capacity, operating hours, lead time, and concurrency handling remain consistent.
4. Payment success must remain server-verified. Never treat a client-side Razorpay callback or redirect as confirmation.
5. Customer and staff surfaces have different intent. Keep the customer portal low-friction and tenant-branded; keep staff routes permission-backed and operational.
6. Keep all tenant theming CSS-variable driven. Do not hardcode a cafe's colors where a tenant token should be used.
7. Use React Query for server state and Zustand only for local workflow/UI state. Reset tenant-scoped state on logout or tenant switch.
8. Add or update tests with behavior changes. Backend tests cover security, payments, allocation, concurrency, RBAC, subscriptions, and lifecycle rules; frontend tests cover helpers, hooks, page shells, and important components.
9. Check `PRODUCT.md` before changing customer-facing information architecture or fields. Its listed five customer states are the intended product boundary.
10. Do not expose secrets, payment credentials, raw tokens, or user data in logs, UI, docs, or commits.

## Paste-ready instruction for another AI

```text
You are working on nextBooq, a multi-tenant cafe reservation SaaS. Read docs/AI_PROJECT_CONTEXT.md first, then inspect the relevant source files before proposing changes. Treat the source code as authoritative if the brief is stale.

Preserve tenant isolation, HTTP-only cookie authentication, server-side RBAC, the reservation state machine, allocation/concurrency guarantees, and backend-verified Razorpay payments. Customer routes are tenant-branded and mobile-first; staff routes are operational; /admin is for cross-tenant platform administrators. Use React Query for remote data and Zustand for local booking/dashboard workflow state. Add or update tests for behavioral changes.
```
