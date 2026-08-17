# Cafe Description & Menu

## Problem

A cafe's public storefront page currently only shows booking mechanics (party size, date/time slots, dining policies) — there's no way for a cafe owner or manager to tell guests anything about the place itself, or list what's on offer. This spec adds an optional description, a cover photo, and a categorized menu that a cafe can set once and have shown on their own public page.

Out of scope: per-menu-item photos, file uploads of any kind, menu item availability/sold-out toggles, dietary tags, drag-to-reorder. All of these are plausible future additions but none are needed for the core ask.

## Data model

`backend/src/models/Cafe.js` gains three new optional fields, all defaulting to "unset" so an untouched cafe renders identically to today. `description` and `hero_image_url` are not new names invented for this feature — `frontend/src/lib/types/models.d.ts`'s `Cafe` interface and `frontend/src/components/booking/hero.tsx` already reference both (the hero banner already renders `cafe.hero_image_url` as a background image and `cafe.description` as body text, falling back to a generic sentence when unset) — the backend schema simply never had these fields, so the frontend code has been silently dead. This spec finally adds them, which means the "cover photo" part of this feature requires no new public-facing display component at all — `Hero.tsx` already does it.

```js
description: { type: String, trim: true, maxlength: 1000, default: '' },
hero_image_url: { type: String, trim: true, default: '' },
menu: [
  {
    category: { type: String, required: true, trim: true, maxlength: 60 },
    items: [
      {
        name: { type: String, required: true, trim: true, maxlength: 80 },
        description: { type: String, trim: true, default: '', maxlength: 300 },
        price: { type: Number, min: 0 }, // optional — some items are "market price" or seasonal, no fixed price
      },
    ],
  },
],
```

`hero_image_url` is a plain string (a link to an image the cafe already hosts elsewhere) — no file upload, no new storage integration. This keeps the feature's infrastructure footprint at effectively zero: a cafe with a large menu (say 100 items across 10 categories) adds roughly 15-20KB to that one document; there is no new query path since it rides along on the existing `getCafeBySlug` fetch already made on every storefront page load.

## Backend

`PUT /api/v1/cafes/:id` (`updateCafe` in `backend/src/controllers/admin/cafeController.js`) — already gated on the existing `edit_settings` permission, same as `reservation_rules` and `operating_hours` — is extended to also accept `description`, `cover_image_url`, and `menu` in the request body. No new route, no new permission.

Validation, added alongside the existing `validateOperatingHoursInput`:
- `description`: if present, must be a string; length is enforced by the schema's `maxlength` (Mongoose validation error surfaces as a 400 via the existing error-handling middleware, same as any other schema validation failure elsewhere in the app).
- `hero_image_url`: if present and non-empty, must be a valid `https://` URL (checked with `new URL()`, not just a prefix test) — `BadRequestError('hero_image_url must be a valid https URL')` otherwise. Tightened from an original http(s)-prefix rule during final review: `next.config.ts`'s `images.remotePatterns` only allows `https` (plus `http` on `localhost`), so an `http://` URL passed backend validation but then crashed `next/image` at render time on the public page, which has no error boundary to contain it. No live fetch/HEAD request to verify the image actually loads; that's the same trade-off the rest of the app makes elsewhere (e.g. no verification that a Razorpay webhook URL is reachable).
- `menu`: a new `validateMenuInput(menu)` function, same shape as `validateOperatingHoursInput`:
  - Must be an array.
  - Each category entry must have a non-empty `category` string.
  - Each category's `items` must be an array; each item must have a non-empty `name` string.
  - If `price` is present on an item, it must be a non-negative number.
  - Any violation throws `BadRequestError` with a message naming the specific problem, matching the existing style (`operating_hours.day_of_week must be one of: ...`).

`getCafeBySlug` needs no changes — it already returns the full `Cafe` document with no field whitelist, so the three new fields are automatically included in the public tenant-resolution response the moment they exist on the schema.

## Frontend

### Types

`frontend/src/lib/types/models.d.ts`: the `Cafe` interface's existing `description?: string` field stays as-is (already there, previously dead since the backend never populated it); `hero_image_url?: string` likewise already exists and stays as-is. A new `menu?: CafeMenuCategory[]` field is added, with a new `CafeMenuCategory` / `CafeMenuItem` pair of interfaces mirroring the backend shape.

### Editing (Settings page)

`frontend/src/app/[tenant]/(dashboard)/settings/page.tsx` gains a new "Storefront" section, saved through the same `PUT /api/v1/cafes/:id` mutation the page already uses for reservation rules and operating hours (one form, one save action — no separate submit button for this section).

New component `frontend/src/components/dashboard/storefront-editor.tsx` (kept separate from `settings/page.tsx` to avoid growing that file further) contains:
- A description `<textarea>` with a live character counter against the 1000-char limit.
- A hero-photo URL `<input>` with a live `<img>` preview beneath it (so a manager can confirm the URL actually renders an image before saving — the preview silently shows a broken-image placeholder if it doesn't, no extra validation logic needed client-side beyond the browser's own image loading).
- A menu editor: a list of category blocks, each with an editable category-name field, a list of item rows (name / description / price fields) underneath, "Add item" per category, "Remove" per item, "Add category" at the bottom, and "Remove category" per block. Local component state holds the in-progress edit; the whole `menu` array is submitted as part of the same settings save. No drag-reordering — items and categories keep the order they were added/typed in.

### Public display

The description and hero photo need **no new component** — `frontend/src/components/booking/hero.tsx` already renders `cafe.hero_image_url` as the banner background and `cafe.description` as body text (falling back to a generic sentence when either is unset), which is exactly this feature's cover-photo/description behavior. Once the backend actually populates these fields, this display starts working with zero frontend changes.

One new component, rendered on `frontend/src/app/[tenant]/(public)/page.tsx` between the existing booking card and the `CafeInfoCard` dining-policies section:

- **`cafe-menu-section.tsx`** — renders only if `cafe.menu` has at least one category with at least one item (categories/items with no content are simply skipped, not shown as empty). Each category is its own collapsible block (native `<details>`/`<summary>`), **expanded by default** so a guest sees the full menu immediately on page load, with the option to collapse categories they're not interested in. Each item shows name, description (if set), and price formatted as `₹<price>` (if set — omitted entirely for items with no price, not shown as "₹—" or similar).

Reads from `useTenant()`'s `cafe`, matching the existing pattern used by `CafeInfoCard`.

## Error handling

- Missing/invalid `category`/item `name` in the menu payload → `400 BadRequestError` naming the specific field, mirroring the existing `operating_hours` validation style. The whole save is rejected atomically — no partial menu updates.
- Negative `price` → `400 BadRequestError`.
- Malformed `hero_image_url` (not a valid `https://` URL) → `400 BadRequestError`.
- `description` over 1000 chars → surfaced as a Mongoose validation error through the existing generic error-handling middleware (same as any other schema `maxlength` violation elsewhere in the app), which already produces a client-visible 400.
- A hero image URL that 404s or otherwise fails to load client-side is not a save-time error — the browser just shows a broken image on the public page (`Hero.tsx`'s existing behavior, unchanged by this spec). This is a conscious trade-off (matches the "no live fetch" decision above) rather than a gap.

## Testing

- **Backend**: integration tests for `updateCafe` covering: successful save of description/hero_image_url/menu together; a save with an invalid `hero_image_url` (400); a menu with a category missing a name (400); a menu with an item missing a name (400); a menu with a negative price (400); a description over 1000 chars (400 via schema validation); confirming `getCafeBySlug` returns the new fields once set. A unit test for `validateMenuInput` covering the valid/invalid cases directly, matching the existing `validateOperatingHoursInput` test coverage style if such tests exist, or added alongside `updateCafe`'s integration tests otherwise.
- **Frontend**: a test for `storefront-editor.tsx` covering add/remove category, add/remove item, and that the submitted payload shape matches what the backend expects. A test for `cafe-menu-section.tsx` covering: renders nothing when `menu` is empty/absent; renders correctly when populated; a category with zero items doesn't render; an item with no price doesn't show a price. `Hero.tsx` has no existing test file despite already having this rendering logic — this spec is what actually makes that logic reachable in practice (the backend never populated these fields before), so it's worth adding one covering: renders the cafe's actual `description`/`hero_image_url` when present, falls back to the generic sentence/gradient when absent.
