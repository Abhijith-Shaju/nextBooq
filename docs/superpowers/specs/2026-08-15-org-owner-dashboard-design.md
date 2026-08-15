# Org Owner Dashboard & Role-Based Login Redirect

## Problem

Roles today live per-cafe: each user has a `staff_memberships` array where each entry has a `cafe_id` and a `role` (`owner`, `manager`, `host`, `staff`). There is no org-level role and no `/org/...` route — every tenant-scoped page lives at `/[tenant]/(dashboard)/...`. When an organization has more than one cafe, a user who owns the whole org still gets redirected to a single cafe's dashboard (`resolvePostAuthDestination` just picks the first membership in array order), with no way to see or manage the org's other cafes.

This spec covers making an org owner's login land them on an org-level dashboard listing all of their org's cafes, and letting them assign cafe staff/managers from there. Non-owners (manager/host/staff) keep today's behavior of landing straight on their cafe's dashboard.

Out of scope: email invites for new staff (staff must already have a nextBooq account), org creation flow changes, multi-org ownership / org switching, and any changes to the platform-admin (`/admin`) area.

## Org-owner detection

A user is considered the owner of an organization when they hold an `owner`-role `staff_membership` on **every** non-deleted cafe belonging to that org, and the org has at least one cafe. This is derived, not stored — no schema change to `Organization` or `User`.

Backend: add `getOwnedOrgId(user)` (e.g. `backend/src/services/orgOwnership.js`) that groups the user's `owner`-role memberships by `org_id`, loads each candidate org's non-deleted cafe count, and returns the `org_id` where the owned-cafe count equals the org's total cafe count. Returns `null` if none match.

This is computed once at login / `getMe` time and exposed on the user payload as `owner_org_id` (mirrors how `is_platform_admin` is already exposed), not recomputed per-request. A user's `owner_org_id` becomes stale only if their memberships change after their session/token was issued — same staleness behavior as `is_platform_admin` today, and considered acceptable (takes effect on next login).

## Login redirect logic

`resolvePostAuthDestination` (`frontend/src/lib/auth/post-auth-destination.ts`) gets a new branch, ordered:

1. `is_platform_admin` → `/admin` (existing, unchanged)
2. `owner_org_id` set → `/org/dashboard` (new) — always, even if the org currently has exactly one cafe
3. Otherwise, existing membership-slug logic → `/${slug}/dashboard` for the first valid cafe membership

`frontend/src/lib/route-guard.ts` gets a new `ORG_ROUTE_PATTERN` matching `/org/...`, added to the protected-route check alongside the existing `DASHBOARD_ROUTE_PATTERN` and `ADMIN_ROUTE_PATTERN`. Unauthenticated users hitting `/org/*` redirect to `/auth/login?callbackUrl=...` same as today's dashboard/admin routes.

## Org dashboard

New route: `frontend/src/app/org/(dashboard)/page.tsx`.

Guard: on load, if the authenticated user's `owner_org_id` is not set, redirect them to their own cafe dashboard (or `/auth/login` if unauthenticated) — mirrors how `/admin` is guarded against non-platform-admins today.

Content: one card per cafe in the owner's org — name, `subscription_status`, and today's reservation count — each linking into that cafe's existing `/[tenant]/dashboard`. No cafe creation from this page (stays a platform-admin action).

Backend endpoint: `GET /api/org/cafes` — resolves the caller's `owner_org_id` server-side (never trusts a client-supplied org id), 403s if not an org owner, returns the org's non-deleted cafes with the stats above.

## Manager assignment

On the org dashboard, each cafe card has an "Assign staff" action: enter an email, pick a role (`owner`, `manager`, `host`, or `staff`), submit.

- `POST /api/org/cafes/:cafeId/staff` — body `{ email, role }`. Verifies the target cafe belongs to the caller's `owner_org_id` (403 otherwise), looks up the user by email (404 with a generic "no account found with that email" if none exists — no account is created, no email sent), then adds or updates that user's `staff_membership` entry for the cafe with the given role.
- `DELETE /api/org/cafes/:cafeId/staff/:userId` — same authorization check, removes the membership entry.
- Assigning `role: 'owner'` is allowed (per product decision) and can make the target user an org owner too, if it results in them owning every cafe in the org. This takes effect on that user's next login, consistent with the staleness note above.

Both endpoints reuse the same cafe-belongs-to-caller's-org authorization check as `GET /api/org/cafes`.

## Error handling

- `/org/*` hit by a non-owner (or unauthenticated user): redirected, same pattern as the existing `/admin` guard.
- Staff-assignment email with no matching account: inline form error, no side effects.
- Cross-org cafe id passed to either staff endpoint: 403, not 404 (avoids leaking cafe existence across orgs).

## Testing

- Backend: unit tests for `getOwnedOrgId` grouping/edge cases (single-cafe org, org owner missing on one cafe, no memberships at all); integration tests for `GET /api/org/cafes`, `POST .../staff`, `DELETE .../staff/:userId` covering the authorization boundaries (non-owner blocked, cross-org cafe blocked, unknown email 404).
- Frontend: extend the existing `post-auth-destination` test file with cases for `owner_org_id` (including precedence under `is_platform_admin`, and the single-cafe-org-still-goes-to-org-dashboard case); extend `route-guard.test.ts` with cases for the new `/org` pattern.
