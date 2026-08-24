# Admin cafe list — search, sort, pagination, owner contact — design spec

## Problem

The platform-admin overview page (`frontend/src/app/admin/page.tsx`) renders every cafe across every organization in one flat, unpaginated table. There's no way to find a specific cafe or org by name, no way to sort by anything, and clicking a cafe row (which opens `SubscriptionDrawer`) shows subscription history but has no way to contact the cafe's owner or see how much time is left on their current plan. This is fine at the platform's current size but degrades as more cafes onboard, and the missing owner contact info means the admin has to go dig through the database (or the separate owner-lookup-by-email endpoint) whenever they need to call a cafe about billing.

## Scope

In scope: a search box (matches cafe name or org name), sort controls (name / cafe-created date / subscription time-remaining, each asc/desc), client-side pagination of the cafe list, and an "Owner" section plus a time-remaining line added to the existing `SubscriptionDrawer`.

Out of scope: server-side pagination or search (dataset is small — dozens of cafes for the foreseeable future, confirmed with the user), any change to how subscriptions are recorded/renewed, any change to the owner-lookup-by-email endpoint (`GET /platform-admin/users/lookup`) which serves a different flow (onboarding a new cafe under an existing owner), and multi-owner support (a cafe with more than one `role: 'owner'` staff membership picks the first one found — rare in practice, not worth extra UI).

## Backend: attach owner contact to the orgs listing

`GET /api/v1/platform-admin/orgs` (`platformAdminController.getOrgs` → `subscriptionAdminService.listOrgsWithCafes`) is the only data source for the admin table. `listOrgsWithCafes` already loads all non-deleted cafes in one query; it gets one more step after building `cafesByOrgId`:

```js
const cafeIds = cafes.map((c) => c._id);
const owners = await User.find(
  { 'staff_memberships.cafe_id': { $in: cafeIds }, 'staff_memberships.role': 'owner' },
  'name email phone staff_memberships'
).lean();

const ownerByCafeId = new Map();
for (const user of owners) {
  for (const membership of user.staff_memberships) {
    if (membership.role !== 'owner') continue;
    const cafeIdStr = membership.cafe_id.toString();
    if (!ownerByCafeId.has(cafeIdStr)) {
      ownerByCafeId.set(cafeIdStr, { name: user.name, email: user.email, phone: user.phone });
    }
  }
}
```

Each cafe object gets `owner: ownerByCafeId.get(cafe._id.toString()) || null` alongside the existing `subscription` field. One query, no N+1. `CafeWithSubscription` (`frontend/src/lib/types/models.d.ts`) gets:

```typescript
owner: { name: string; email: string; phone: string } | null;
```

## Frontend: row shaping (`frontend/src/lib/admin/cafe-rows.ts`, new)

A small pure module, independently testable, that the page imports:

```typescript
export interface CafeRow {
  cafe: CafeWithSubscription;
  orgId: string;
  orgName: string;
}

export function flattenCafeRows(orgs: OrgWithCafes[]): CafeRow[];
export function filterCafeRows(rows: CafeRow[], query: string): CafeRow[];
export type SortField = 'name' | 'date' | 'remaining';
export type SortDir = 'asc' | 'desc';
export function sortCafeRows(rows: CafeRow[], field: SortField, dir: SortDir): CafeRow[];
```

- `filterCafeRows`: case-insensitive substring match against `cafe.name` OR `orgName`. Empty/whitespace query returns all rows unchanged.
- `sortCafeRows`:
  - `'name'` — `cafe.name`, locale compare.
  - `'date'` — `cafe.created_at`, chronological.
  - `'remaining'` — compute `remainingMs = subscription ? new Date(subscription.current_period_end).getTime() - Date.now() : null`. Rows where `remainingMs` is `null` or `<= 0` (no plan configured, or the plan already lapsed) always sort after every row with positive `remainingMs`, regardless of `dir`. Within the "has a live countdown" group, sort by `remainingMs` per `dir`. This matches the user's explicit choice: cafes without a real countdown never get pulled into ascending order at the top just because "no time left" looks smallest.
- All three are pure functions over arrays — no React, no hooks — so they get direct unit tests without rendering anything.

## Frontend: admin page (`frontend/src/app/admin/page.tsx`)

New local state: `searchQuery: string`, `sortField: SortField` (default `'name'`), `sortDir: SortDir` (default `'asc'`), `page: number` (default `1`, `PAGE_SIZE = 10`).

Render, above the table:
- A search `<input>` (placeholder "Search by cafe or organization name"), updates `searchQuery` on change.
- A sort `<select>` with the three field options, plus a direction toggle `<button>` (↑/↓ icon, flips `sortDir`).

Pipeline: `flattenCafeRows(orgs)` → `filterCafeRows(rows, searchQuery)` → `sortCafeRows(filtered, sortField, sortDir)` → slice to `[(page-1)*PAGE_SIZE, page*PAGE_SIZE)` for the table body. Changing `searchQuery`, `sortField`, or `sortDir` resets `page` to `1` (a `useEffect` or inline reset in the handlers — handlers are simpler, no extra effect).

Below the table: Prev/Next buttons plus "Page X of Y" text, matching the existing table's plain-Tailwind style (no new UI library). Prev/Next disable at the boundaries. If the filtered set is empty, show a plain "No cafes match your search." row instead of an empty table body.

The table itself is otherwise unchanged — same columns, same `onClick`-opens-drawer behavior, same `selectedCafeId` highlight logic — just fed from the paginated/filtered/sorted slice instead of the raw `orgs.flatMap(...)`.

## SubscriptionDrawer (`frontend/src/components/admin/subscription-drawer.tsx`)

Needs the full `CafeWithSubscription` (for `owner`) and the current subscription's `current_period_end`, neither of which it currently receives — today it's only given `cafeId`/`orgId` and re-derives subscription state from `useCafeSubscriptions`. Simplest change: pass the selected `CafeRow`'s `cafe` object down as a new `cafe: CafeWithSubscription` prop (replacing the need to separately look anything up), alongside the existing `cafeId`/`orgId`/`onClose`.

At the top of the drawer, above the existing "Current: ..." summary:

```tsx
<div className="mb-4 rounded-lg border border-slate-200 p-3 text-sm">
  <h3 className="mb-1 text-xs font-bold uppercase text-slate-500">Owner</h3>
  {cafe.owner ? (
    <div className="space-y-0.5">
      <p className="font-medium">{cafe.owner.name}</p>
      <a href={`mailto:${cafe.owner.email}`} className="block text-blue-600 hover:underline">{cafe.owner.email}</a>
      <a href={`tel:${cafe.owner.phone}`} className="block text-blue-600 hover:underline">{cafe.owner.phone}</a>
    </div>
  ) : (
    <p className="text-slate-500">No owner assigned yet.</p>
  )}
</div>
```

Time remaining is added as one line inside the existing "Current: ..." block, computed from `current.current_period_end` (reusing the already-imported `date-fns`):

```tsx
{isLapsed(current) ? (
  <p className="text-xs text-slate-500">Expired {formatDistanceToNow(new Date(current.current_period_end))} ago</p>
) : (
  <p className="text-xs text-slate-500">{formatDistanceToNow(new Date(current.current_period_end))} remaining</p>
)}
```

(`isLapsed` already exists in this file.) No other behavior in the drawer changes — renew form, status actions, and history list stay exactly as they are.

## Testing

- `frontend/src/lib/admin/cafe-rows.test.ts` (new): `flattenCafeRows` produces one row per cafe with correct `orgName`/`orgId`; `filterCafeRows` matches on cafe name, matches on org name, is case-insensitive, empty query returns everything; `sortCafeRows` for each field asc/desc, plus the "no countdown pushed to the end regardless of direction" case for `'remaining'`.
- `frontend/src/app/admin/page.test.tsx`: extend existing mocked-fetch tests — typing in search filters the table, changing sort field/direction reorders rows, pagination controls page through >10 rows and disable at the boundaries.
- `frontend/src/components/admin/subscription-drawer.test.tsx`: extend to pass a `cafe` prop with a populated `owner` and assert the name/email/phone render with correct `mailto:`/`tel:` hrefs; a `cafe` with `owner: null` shows the "No owner assigned yet." fallback; time-remaining renders "X remaining" for a live subscription and "Expired X ago" for a lapsed one.
- Backend: extend `platformAdminRoutes.test.js` (or wherever `GET /orgs` is currently covered) with a case asserting a cafe with an `owner`-role staff member returns `owner: { name, email, phone }`, and a cafe with no owner-role staff member returns `owner: null`.
