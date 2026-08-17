# Cafe Description & Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a cafe manager/owner set a description, a hero photo URL, and a categorized menu on their cafe, and have all three show up on the cafe's public storefront page.

**Architecture:** Three new optional fields on the existing `Cafe` Mongoose model (`description`, `hero_image_url`, `menu`), saved through the existing `PUT /api/v1/cafes/:id` settings endpoint (same permission, same request/response shape, just more accepted fields). `description`/`hero_image_url` need zero new frontend display code — `Hero.tsx` already renders them and has simply never received real values before. `menu` gets one new public display component. Editing happens in a new "Storefront" section on the existing cafe Settings page.

**Tech Stack:** Express + Mongoose (backend), Next.js App Router + React + TailwindCSS + Vitest/Testing Library (frontend), Jest + Supertest (backend tests).

## Global Constraints

- `description`: max 1000 characters, optional.
- `hero_image_url`: optional; if set, must be a valid `https://` URL (tightened from an original http(s) rule during final review, since `next.config.ts`'s image loader can't render arbitrary `http://` URLs and there's no error boundary to contain the resulting crash).
- `menu`: optional array of `{ category: string, items: [{ name: string, description?: string, price?: number }] }`; `category` and item `name` are required non-empty strings when present at all; `price` if present must be `>= 0`.
- All three fields default to "unset" — an untouched cafe must render identically to how it does today.
- Reuse the existing `edit_settings` permission and the existing `PUT /api/v1/cafes/:id` route — no new route, no new permission.
- No file upload, no image storage integration — `hero_image_url` is a plain string the cafe owner pastes in.

---

### Task 1: Backend — Cafe schema fields, menu validation, and updateCafe wiring

**Files:**
- Modify: `backend/src/models/Cafe.js`
- Modify: `backend/src/controllers/admin/cafeController.js`
- Create: `backend/tests/integration/cafeStorefrontSettings.test.js`

**Interfaces:**
- Produces: `Cafe` documents now have `description: string`, `hero_image_url: string`, `menu: Array<{ category: string, items: Array<{ name: string, description: string, price?: number }> }>`. `PUT /api/v1/cafes/:cafeId` accepts `description`, `hero_image_url`, `menu` in the request body (alongside the existing `reservation_rules`, `operating_hours`) and returns the full updated `Cafe` document, same as today. `GET /api/v1/cafes/slug/:slug` (via `getCafeBySlug`, unchanged) returns these fields once set, since it already returns the full document with no field whitelist.

- [ ] **Step 1: Write the failing integration tests**

Create `backend/tests/integration/cafeStorefrontSettings.test.js`:

```js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Integration Test: cafe storefront settings (description, hero image, menu)', () => {
  let cafe;
  let ownerToken;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Storefront Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Storefront Cafe',
      slug: 'storefront-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });
    const owner = await User.create({
      name: 'Owner',
      email: 'owner-storefront@test.com',
      phone: '+1555900001',
      password_hash: 'pass',
      staff_memberships: [{ cafe_id: cafe._id, role: 'owner', permissions: [] }],
    });
    ownerToken = jwt.sign({ id: owner._id.toString() }, config.JWT_SECRET);
  });

  const putSettings = (body) =>
    request(app).put(`/api/v1/cafes/${cafe._id}`).set('Authorization', `Bearer ${ownerToken}`).send(body);

  test('saves description, hero_image_url, and menu together', async () => {
    const menu = [
      {
        category: 'Coffee',
        items: [
          { name: 'Espresso', description: 'Double shot', price: 120 },
          { name: 'Filter Coffee', price: 90 },
        ],
      },
      {
        category: 'Snacks',
        items: [{ name: 'Croissant' }],
      },
    ];

    const res = await putSettings({
      description: 'A cozy neighborhood cafe.',
      hero_image_url: 'https://example.com/hero.jpg',
      menu,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.description).toBe('A cozy neighborhood cafe.');
    expect(res.body.data.hero_image_url).toBe('https://example.com/hero.jpg');
    expect(res.body.data.menu).toHaveLength(2);
    expect(res.body.data.menu[0].items).toHaveLength(2);
    expect(res.body.data.menu[0].items[0].price).toBe(120);
    expect(res.body.data.menu[1].items[0].name).toBe('Croissant');

    const persisted = await Cafe.findById(cafe._id);
    expect(persisted.description).toBe('A cozy neighborhood cafe.');
    expect(persisted.menu).toHaveLength(2);
  });

  test('a cafe that never sets these fields keeps them empty', async () => {
    const res = await putSettings({ reservation_rules: { max_party_size: 8 } });

    expect(res.status).toBe(200);
    expect(res.body.data.description).toBe('');
    expect(res.body.data.hero_image_url).toBe('');
    expect(res.body.data.menu).toEqual([]);
  });

  test('rejects a hero_image_url that is not http(s)', async () => {
    const res = await putSettings({ hero_image_url: 'ftp://example.com/hero.jpg' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/hero_image_url/i);
  });

  test('rejects a menu category with no name', async () => {
    const res = await putSettings({
      menu: [{ category: '', items: [{ name: 'Espresso' }] }],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/category/i);
  });

  test('rejects a menu item with no name', async () => {
    const res = await putSettings({
      menu: [{ category: 'Coffee', items: [{ name: '', price: 100 }] }],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/name/i);
  });

  test('rejects a negative menu item price', async () => {
    const res = await putSettings({
      menu: [{ category: 'Coffee', items: [{ name: 'Espresso', price: -50 }] }],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/price/i);
  });

  test('rejects a description over 1000 characters', async () => {
    const res = await putSettings({ description: 'a'.repeat(1001) });

    expect(res.status).toBe(400);
  });

  test('a newly-saved menu is visible on the public getCafeBySlug endpoint', async () => {
    await putSettings({
      description: 'Great coffee, better people.',
      menu: [{ category: 'Coffee', items: [{ name: 'Espresso', price: 120 }] }],
    });

    const res = await request(app).get(`/api/v1/cafes/slug/${cafe.slug}`);

    expect(res.status).toBe(200);
    expect(res.body.data.description).toBe('Great coffee, better people.');
    expect(res.body.data.menu[0].category).toBe('Coffee');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest tests/integration/cafeStorefrontSettings.test.js`
Expected: multiple failures — the "saves description..." test fails because `res.body.data.description` is `undefined` (the field doesn't exist on the schema and `updateCafe` doesn't read it from the body yet); the four "rejects..." tests fail because they currently get `200` back instead of `400` (nothing validates these fields yet).

- [ ] **Step 3: Add the fields to the Cafe schema**

In `backend/src/models/Cafe.js`, add three fields to the schema object (after `operating_hours`, before `subscription_status`):

```js
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'description must be 1000 characters or fewer'],
      default: '',
    },
    hero_image_url: {
      type: String,
      trim: true,
      default: '',
    },
    menu: [
      {
        category: {
          type: String,
          required: [true, 'menu category name is required'],
          trim: true,
          maxlength: 60,
        },
        items: [
          {
            name: {
              type: String,
              required: [true, 'menu item name is required'],
              trim: true,
              maxlength: 80,
            },
            description: { type: String, trim: true, default: '', maxlength: 300 },
            price: { type: Number, min: 0 },
          },
        ],
      },
    ],
```

- [ ] **Step 4: Add menu/hero_image_url validation and wire everything into updateCafe**

In `backend/src/controllers/admin/cafeController.js`, add a `validateMenuInput` function right after `validateOperatingHoursInput`:

```js
const HTTP_URL_PATTERN = /^https?:\/\//i;

const validateMenuInput = (menu) => {
  if (!Array.isArray(menu)) {
    throw new BadRequestError('menu must be an array');
  }

  for (const category of menu) {
    const { category: categoryName, items } = category || {};

    if (typeof categoryName !== 'string' || categoryName.trim().length === 0) {
      throw new BadRequestError('menu.category is required and must be a non-empty string');
    }
    if (!Array.isArray(items)) {
      throw new BadRequestError(`menu.items must be an array for category "${categoryName}"`);
    }

    for (const item of items) {
      const { name, price } = item || {};

      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new BadRequestError(`menu item name is required and must be a non-empty string (category "${categoryName}")`);
      }
      if (price !== undefined && price !== null && (typeof price !== 'number' || price < 0)) {
        throw new BadRequestError(`menu item price must be a non-negative number (item "${name}")`);
      }
    }
  }
};
```

Then update `updateCafe` to destructure and apply the three new fields — replace this line:

```js
    const { reservation_rules, operating_hours } = req.body;
```

with:

```js
    const { reservation_rules, operating_hours, description, hero_image_url, menu } = req.body;
```

and add this block right after the existing `if (operating_hours !== undefined) { ... }` block, before `await cafe.save();`:

```js
    if (description !== undefined) {
      if (typeof description !== 'string') {
        throw new BadRequestError('description must be a string');
      }
      cafe.description = description;
    }

    if (hero_image_url !== undefined) {
      if (typeof hero_image_url !== 'string') {
        throw new BadRequestError('hero_image_url must be a string');
      }
      if (hero_image_url.length > 0 && !HTTP_URL_PATTERN.test(hero_image_url)) {
        throw new BadRequestError('hero_image_url must be a valid http(s) URL');
      }
      cafe.hero_image_url = hero_image_url;
    }

    if (menu !== undefined) {
      validateMenuInput(menu);
      cafe.menu = menu;
    }
```

The `description` over-1000-chars test relies on the schema's own `maxlength` validator firing on `cafe.save()` (Mongoose validation error → the app's existing generic error-handling middleware turns that into a 400) — no extra length check needed in the controller.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx jest tests/integration/cafeStorefrontSettings.test.js`
Expected: all 8 tests PASS.

- [ ] **Step 6: Run the full backend test suite to check for regressions**

Run: `cd backend && npx jest`
Expected: all suites pass (no regressions in `operatingHoursSettings.test.js` or anywhere else that exercises `updateCafe`/`getCafeBySlug`).

- [ ] **Step 7: Commit**

```bash
git add backend/src/models/Cafe.js backend/src/controllers/admin/cafeController.js backend/tests/integration/cafeStorefrontSettings.test.js
git commit -m "feat: add description, hero_image_url, and menu fields to cafe settings"
```

---

### Task 2: Frontend — types and the StorefrontEditor component

**Files:**
- Modify: `frontend/src/lib/types/models.d.ts`
- Create: `frontend/src/components/dashboard/storefront-editor.tsx`
- Create: `frontend/src/components/dashboard/storefront-editor.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1 directly (this is a pure frontend component task; it assumes the backend shape documented in Task 1's Global Constraints).
- Produces: `CafeMenuItem { name: string; description?: string; price?: number }`, `CafeMenuCategory { category: string; items: CafeMenuItem[] }`, and `Cafe.menu?: CafeMenuCategory[]` (types, consumed by Task 3 and Task 4). `StorefrontEditor` component: `{ description: string; heroImageUrl: string; menu: CafeMenuCategory[]; onDescriptionChange: (value: string) => void; onHeroImageUrlChange: (value: string) => void; onMenuChange: (menu: CafeMenuCategory[]) => void }` — a fully controlled component with no internal fetch/save logic of its own (Task 3 owns state and the actual save call, matching how `settings/page.tsx` already owns `operatingHours` state and passes it down as props/callbacks to inline JSX today).

- [ ] **Step 1: Add the new types**

In `frontend/src/lib/types/models.d.ts`, add after the `OperatingHourEntry` interface (before `export interface Cafe`):

```ts
export interface CafeMenuItem {
  name: string;
  description?: string;
  price?: number;
}

export interface CafeMenuCategory {
  category: string;
  items: CafeMenuItem[];
}
```

Then add `menu?: CafeMenuCategory[];` to the `Cafe` interface, right after the existing `hero_image_url?: string;` line. (`description` and `hero_image_url` already exist on this interface — no change needed to either.)

- [ ] **Step 2: Write the failing component test**

Create `frontend/src/components/dashboard/storefront-editor.test.tsx`:

```tsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { StorefrontEditor } from './storefront-editor';
import { CafeMenuCategory } from '@/lib/types/models';

const noop = () => {};

describe('StorefrontEditor', () => {
  test('renders the current description and hero image URL', () => {
    render(
      <StorefrontEditor
        description="A cozy cafe."
        heroImageUrl="https://example.com/hero.jpg"
        menu={[]}
        onDescriptionChange={noop}
        onHeroImageUrlChange={noop}
        onMenuChange={noop}
      />
    );

    expect(screen.getByLabelText(/description/i)).toHaveValue('A cozy cafe.');
    expect(screen.getByLabelText(/hero photo url/i)).toHaveValue('https://example.com/hero.jpg');
  });

  test('typing in the description field calls onDescriptionChange', () => {
    const onDescriptionChange = vi.fn();
    render(
      <StorefrontEditor
        description=""
        heroImageUrl=""
        menu={[]}
        onDescriptionChange={onDescriptionChange}
        onHeroImageUrlChange={noop}
        onMenuChange={noop}
      />
    );

    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'New description' } });

    expect(onDescriptionChange).toHaveBeenCalledWith('New description');
  });

  test('adding a category calls onMenuChange with a new empty category appended', () => {
    const onMenuChange = vi.fn();
    render(
      <StorefrontEditor
        description=""
        heroImageUrl=""
        menu={[]}
        onDescriptionChange={noop}
        onHeroImageUrlChange={noop}
        onMenuChange={onMenuChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /add category/i }));

    expect(onMenuChange).toHaveBeenCalledWith([{ category: '', items: [] }]);
  });

  test('adding an item to an existing category appends an empty item to that category only', () => {
    const menu: CafeMenuCategory[] = [
      { category: 'Coffee', items: [{ name: 'Espresso', price: 120 }] },
      { category: 'Snacks', items: [] },
    ];
    const onMenuChange = vi.fn();
    render(
      <StorefrontEditor
        description=""
        heroImageUrl=""
        menu={menu}
        onDescriptionChange={noop}
        onHeroImageUrlChange={noop}
        onMenuChange={onMenuChange}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: /add item/i })[0]);

    expect(onMenuChange).toHaveBeenCalledWith([
      { category: 'Coffee', items: [{ name: 'Espresso', price: 120 }, { name: '', description: '', price: undefined }] },
      { category: 'Snacks', items: [] },
    ]);
  });

  test('removing a category calls onMenuChange without that category', () => {
    const menu: CafeMenuCategory[] = [
      { category: 'Coffee', items: [] },
      { category: 'Snacks', items: [] },
    ];
    const onMenuChange = vi.fn();
    render(
      <StorefrontEditor
        description=""
        heroImageUrl=""
        menu={menu}
        onDescriptionChange={noop}
        onHeroImageUrlChange={noop}
        onMenuChange={onMenuChange}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: /remove category/i })[0]);

    expect(onMenuChange).toHaveBeenCalledWith([{ category: 'Snacks', items: [] }]);
  });

  test('editing an item name calls onMenuChange with only that item updated', () => {
    const menu: CafeMenuCategory[] = [{ category: 'Coffee', items: [{ name: 'Espresso', price: 120 }] }];
    const onMenuChange = vi.fn();
    render(
      <StorefrontEditor
        description=""
        heroImageUrl=""
        menu={menu}
        onDescriptionChange={noop}
        onHeroImageUrlChange={noop}
        onMenuChange={onMenuChange}
      />
    );

    fireEvent.change(screen.getByDisplayValue('Espresso'), { target: { value: 'Cappuccino' } });

    expect(onMenuChange).toHaveBeenCalledWith([
      { category: 'Coffee', items: [{ name: 'Cappuccino', price: 120 }] },
    ]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/storefront-editor.test.tsx`
Expected: FAIL — `storefront-editor.tsx` does not exist yet (module not found).

- [ ] **Step 4: Implement StorefrontEditor**

Create `frontend/src/components/dashboard/storefront-editor.tsx`:

```tsx
'use client';

import { CafeMenuCategory, CafeMenuItem } from '@/lib/types/models';
import { Image as ImageIcon, Info, Plus, Trash2, UtensilsCrossed } from 'lucide-react';

const DESCRIPTION_MAX_LENGTH = 1000;

interface StorefrontEditorProps {
  description: string;
  heroImageUrl: string;
  menu: CafeMenuCategory[];
  onDescriptionChange: (value: string) => void;
  onHeroImageUrlChange: (value: string) => void;
  onMenuChange: (menu: CafeMenuCategory[]) => void;
}

const EMPTY_ITEM: CafeMenuItem = { name: '', description: '', price: undefined };

export function StorefrontEditor({
  description,
  heroImageUrl,
  menu,
  onDescriptionChange,
  onHeroImageUrlChange,
  onMenuChange,
}: StorefrontEditorProps) {
  const addCategory = () => {
    onMenuChange([...menu, { category: '', items: [] }]);
  };

  const removeCategory = (categoryIndex: number) => {
    onMenuChange(menu.filter((_, i) => i !== categoryIndex));
  };

  const updateCategoryName = (categoryIndex: number, name: string) => {
    onMenuChange(menu.map((cat, i) => (i === categoryIndex ? { ...cat, category: name } : cat)));
  };

  const addItem = (categoryIndex: number) => {
    onMenuChange(
      menu.map((cat, i) => (i === categoryIndex ? { ...cat, items: [...cat.items, { ...EMPTY_ITEM }] } : cat))
    );
  };

  const removeItem = (categoryIndex: number, itemIndex: number) => {
    onMenuChange(
      menu.map((cat, i) =>
        i === categoryIndex ? { ...cat, items: cat.items.filter((_, j) => j !== itemIndex) } : cat
      )
    );
  };

  const updateItem = (categoryIndex: number, itemIndex: number, patch: Partial<CafeMenuItem>) => {
    onMenuChange(
      menu.map((cat, i) =>
        i === categoryIndex
          ? { ...cat, items: cat.items.map((item, j) => (j === itemIndex ? { ...item, ...patch } : item)) }
          : cat
      )
    );
  };

  return (
    <div className="pt-6 border-t border-brand-brown/10 space-y-6">
      <h2 className="text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
        <Info className="w-4 h-4 text-brand-red" /> Storefront
      </h2>
      <p className="text-[11px] text-brand-mochaMid -mt-4">
        Shown on your cafe's public page. Leave blank to keep the default look.
      </p>

      <div>
        <label htmlFor="storefront-description" className="block text-sm font-semibold text-brand-brown mb-1.5">
          Description
        </label>
        <textarea
          id="storefront-description"
          value={description}
          maxLength={DESCRIPTION_MAX_LENGTH}
          rows={3}
          onChange={(e) => onDescriptionChange(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm"
        />
        <p className="text-[11px] text-brand-mochaMid mt-1 text-right">
          {description.length}/{DESCRIPTION_MAX_LENGTH}
        </p>
      </div>

      <div>
        <label htmlFor="hero-image-url" className="block text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
          <ImageIcon className="w-4 h-4 text-brand-red" /> Hero Photo URL
        </label>
        <input
          id="hero-image-url"
          type="text"
          value={heroImageUrl}
          onChange={(e) => onHeroImageUrlChange(e.target.value)}
          placeholder="https://..."
          className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm"
        />
        {heroImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImageUrl}
            alt="Hero preview"
            className="mt-2 h-32 w-full max-w-sm rounded-xl object-cover border border-brand-brown/10"
          />
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-brand-brown mb-2 flex items-center gap-1.5">
          <UtensilsCrossed className="w-4 h-4 text-brand-red" /> Menu
        </h3>

        <div className="space-y-4">
          {menu.map((cat, categoryIndex) => (
            <div key={categoryIndex} className="rounded-xl border border-brand-brown/10 bg-white p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={cat.category}
                  placeholder="Category name (e.g. Coffee)"
                  onChange={(e) => updateCategoryName(categoryIndex, e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-brand-brown/20 bg-white text-sm font-semibold"
                />
                <button
                  type="button"
                  onClick={() => removeCategory(categoryIndex)}
                  aria-label={`Remove category ${cat.category || categoryIndex + 1}`}
                  className="p-2 rounded-lg text-rose-500 hover:bg-rose-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                {cat.items.map((item, itemIndex) => (
                  <div key={itemIndex} className="flex flex-wrap items-center gap-2 pl-4">
                    <input
                      type="text"
                      value={item.name}
                      placeholder="Item name"
                      onChange={(e) => updateItem(categoryIndex, itemIndex, { name: e.target.value })}
                      className="flex-1 min-w-[8rem] px-3 py-2 rounded-lg border border-brand-brown/20 bg-white text-sm"
                    />
                    <input
                      type="text"
                      value={item.description || ''}
                      placeholder="Description (optional)"
                      onChange={(e) => updateItem(categoryIndex, itemIndex, { description: e.target.value })}
                      className="flex-1 min-w-[8rem] px-3 py-2 rounded-lg border border-brand-brown/20 bg-white text-sm"
                    />
                    <input
                      type="number"
                      min={0}
                      value={item.price ?? ''}
                      placeholder="Price"
                      onChange={(e) =>
                        updateItem(categoryIndex, itemIndex, {
                          price: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      className="w-24 px-3 py-2 rounded-lg border border-brand-brown/20 bg-white text-sm font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(categoryIndex, itemIndex)}
                      aria-label={`Remove item ${item.name || itemIndex + 1}`}
                      className="p-2 rounded-lg text-rose-500 hover:bg-rose-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => addItem(categoryIndex)}
                className="ml-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-red hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> Add item
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addCategory}
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-red hover:underline"
        >
          <Plus className="w-3.5 h-3.5" /> Add category
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/dashboard/storefront-editor.test.tsx`
Expected: all 6 tests PASS.

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/types/models.d.ts frontend/src/components/dashboard/storefront-editor.tsx frontend/src/components/dashboard/storefront-editor.test.tsx
git commit -m "feat: add StorefrontEditor component for cafe description/hero image/menu"
```

---

### Task 3: Frontend — wire StorefrontEditor into the Settings page

**Files:**
- Modify: `frontend/src/app/[tenant]/(dashboard)/settings/page.tsx`
- Modify: `frontend/src/app/[tenant]/(dashboard)/settings/page.test.tsx`

**Interfaces:**
- Consumes: `StorefrontEditor` from Task 2 (`frontend/src/components/dashboard/storefront-editor.tsx`), `CafeMenuCategory` type from Task 2.
- Produces: the settings page's single save button now also submits `description`, `hero_image_url`, and `menu` in the same `PUT /api/v1/cafes/:id` call.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/app/[tenant]/(dashboard)/settings/page.test.tsx`, inside the existing `describe('CafeSettingsPage — operating hours', ...)` block is fine, but since these are about the storefront section specifically, add a new top-level `describe` block at the end of the file (after the existing closing `});` of `'CafeSettingsPage — operating hours'`):

```tsx
describe('CafeSettingsPage — storefront', () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.mocked(axiosInstance.put).mockReset().mockResolvedValue({ data: { data: {} } });
  });

  test('shows the cafe\'s existing description and hero image URL', () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: { ...makeCafe(), description: 'Great coffee.', hero_image_url: 'https://example.com/hero.jpg' },
    } as any);
    render(<CafeSettingsPage />);

    expect(screen.getByLabelText(/description/i)).toHaveValue('Great coffee.');
    expect(screen.getByLabelText(/hero photo url/i)).toHaveValue('https://example.com/hero.jpg');
  });

  test('saving includes description, hero_image_url, and menu in the request body', async () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: {
        ...makeCafe(),
        description: 'Great coffee.',
        hero_image_url: 'https://example.com/hero.jpg',
        menu: [{ category: 'Coffee', items: [{ name: 'Espresso', price: 120 }] }],
      },
    } as any);
    render(<CafeSettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: /save cafe rules/i }));

    await waitFor(() =>
      expect(axiosInstance.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          description: 'Great coffee.',
          hero_image_url: 'https://example.com/hero.jpg',
          menu: [{ category: 'Coffee', items: [{ name: 'Espresso', price: 120 }] }],
        })
      )
    );
  });

  test('editing the description field updates what would be submitted on save', async () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: makeCafe() } as any);
    render(<CafeSettingsPage />);

    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Updated description' } });
    fireEvent.click(screen.getByRole('button', { name: /save cafe rules/i }));

    await waitFor(() =>
      expect(axiosInstance.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ description: 'Updated description' })
      )
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run "src/app/[tenant]/(dashboard)/settings/page.test.tsx"`
Expected: the three new tests FAIL — there's no "description"/"hero photo url" label on the page yet, and the submitted body doesn't include these fields.

- [ ] **Step 3: Wire StorefrontEditor into the page**

In `frontend/src/app/[tenant]/(dashboard)/settings/page.tsx`:

Add the import (with the other imports at the top):

```tsx
import { StorefrontEditor } from '@/components/dashboard/storefront-editor';
import { CafeMenuCategory } from '@/lib/types/models';
```

Add new state, right after the existing `operatingHours` state declaration:

```tsx
  const [description, setDescription] = useState(cafe.description || '');
  const [heroImageUrl, setHeroImageUrl] = useState(cafe.hero_image_url || '');
  const [menu, setMenu] = useState<CafeMenuCategory[]>(cafe.menu || []);
```

Extend the existing sync `useEffect` — add these three lines inside the effect body (alongside the existing `setTurnTime`/`setOperatingHours` calls) and add the corresponding dependencies to the array:

```tsx
    setDescription(cafe.description || '');
    setHeroImageUrl(cafe.hero_image_url || '');
    setMenu(cafe.menu || []);
```

with dependency array additions `cafe.description`, `cafe.hero_image_url`, and a `menuKey = JSON.stringify(cafe.menu || [])` computed the same way `operatingHoursKey` already is, added to the dependency list in place of a raw `cafe.menu` reference (matching the existing pattern for `operatingHours` exactly, since `menu` is likewise an array/object that would otherwise break referential-equality-based effect deps).

Extend the `handleSubmit` PUT call — add these three fields to the existing object literal passed to `axiosInstance.put`, alongside `reservation_rules` and `operating_hours`:

```tsx
        description,
        hero_image_url: heroImageUrl,
        menu,
```

Finally, render `<StorefrontEditor />` inside the `<form>`, right after the existing Operating Hours `<div className="pt-6 border-t ...">...</div>` block and before the final submit-button `<div className="pt-6 border-t ... flex justify-end">`:

```tsx
          <StorefrontEditor
            description={description}
            heroImageUrl={heroImageUrl}
            menu={menu}
            onDescriptionChange={setDescription}
            onHeroImageUrlChange={setHeroImageUrl}
            onMenuChange={setMenu}
          />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run "src/app/[tenant]/(dashboard)/settings/page.test.tsx"`
Expected: all tests in the file PASS (both pre-existing and the three new ones).

- [ ] **Step 5: Type-check and run the full frontend test suite**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: no type errors; all suites pass.

- [ ] **Step 6: Commit**

```bash
git add "frontend/src/app/[tenant]/(dashboard)/settings/page.tsx" "frontend/src/app/[tenant]/(dashboard)/settings/page.test.tsx"
git commit -m "feat: wire StorefrontEditor into the cafe settings page"
```

---

### Task 4: Frontend — public menu display section

**Files:**
- Create: `frontend/src/components/booking/cafe-menu-section.tsx`
- Create: `frontend/src/components/booking/cafe-menu-section.test.tsx`
- Modify: `frontend/src/app/[tenant]/(public)/page.tsx`

**Interfaces:**
- Consumes: `useTenant()` from `@/components/providers/tenant-provider` (existing), `Cafe.menu` type from Task 2.
- Produces: `CafeMenuSection` component (no props — reads `cafe` from `useTenant()`, matching `CafeInfoCard`'s existing pattern), rendered on the public tenant page.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/booking/cafe-menu-section.test.tsx`:

```tsx
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { CafeMenuSection } from './cafe-menu-section';
import { useTenant } from '@/components/providers/tenant-provider';
import { vi } from 'vitest';

vi.mock('@/components/providers/tenant-provider', () => ({
  useTenant: vi.fn(),
}));

const baseCafe = { id: 'cafe_1', slug: 'demo-cafe', name: 'Demo Cafe', timezone: 'UTC', reservation_rules: {} as any };

describe('CafeMenuSection', () => {
  test('renders nothing when the cafe has no menu', () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: { ...baseCafe, menu: [] } } as any);
    const { container } = render(<CafeMenuSection />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when menu is undefined', () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: { ...baseCafe } } as any);
    const { container } = render(<CafeMenuSection />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders categories and items when a menu is set', () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: {
        ...baseCafe,
        menu: [
          {
            category: 'Coffee',
            items: [
              { name: 'Espresso', description: 'Double shot', price: 120 },
              { name: 'Filter Coffee' },
            ],
          },
        ],
      },
    } as any);
    render(<CafeMenuSection />);

    expect(screen.getByText('Coffee')).toBeInTheDocument();
    expect(screen.getByText('Espresso')).toBeInTheDocument();
    expect(screen.getByText('Double shot')).toBeInTheDocument();
    expect(screen.getByText('₹120')).toBeInTheDocument();
    expect(screen.getByText('Filter Coffee')).toBeInTheDocument();
  });

  test('skips a category that has zero items', () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: {
        ...baseCafe,
        menu: [
          { category: 'Empty Category', items: [] },
          { category: 'Coffee', items: [{ name: 'Espresso', price: 120 }] },
        ],
      },
    } as any);
    render(<CafeMenuSection />);

    expect(screen.queryByText('Empty Category')).not.toBeInTheDocument();
    expect(screen.getByText('Coffee')).toBeInTheDocument();
  });

  test('does not show a price for an item with no price', () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: { ...baseCafe, menu: [{ category: 'Coffee', items: [{ name: 'Filter Coffee' }] }] },
    } as any);
    render(<CafeMenuSection />);

    expect(screen.getByText('Filter Coffee')).toBeInTheDocument();
    expect(screen.queryByText(/₹/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/booking/cafe-menu-section.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement CafeMenuSection**

Create `frontend/src/components/booking/cafe-menu-section.tsx`:

```tsx
'use client';

import { useTenant } from '@/components/providers/tenant-provider';
import { UtensilsCrossed } from 'lucide-react';

export function CafeMenuSection() {
  const { cafe } = useTenant();

  const categoriesWithItems = (cafe.menu || []).filter((cat) => cat.items.length > 0);
  if (categoriesWithItems.length === 0) {
    return null;
  }

  return (
    <section className="py-12 max-w-4xl mx-auto w-full px-4">
      <div className="text-center space-y-1 mb-8">
        <h3 className="font-display text-2xl font-bold text-brand-brown flex items-center justify-center gap-2">
          <UtensilsCrossed className="w-6 h-6 text-brand-red" /> Menu
        </h3>
      </div>

      <div className="space-y-4">
        {categoriesWithItems.map((cat, i) => (
          <details key={i} open className="glass rounded-2xl border border-brand-brown/10 shadow-brand-sm group">
            <summary className="cursor-pointer list-none px-5 py-4 font-display font-bold text-brand-brown flex items-center justify-between">
              {cat.category}
              <span className="text-xs text-brand-mochaMid group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="px-5 pb-4 space-y-3">
              {cat.items.map((item, j) => (
                <div key={j} className="flex items-start justify-between gap-4 border-t border-brand-brown/10 pt-3 first:border-t-0 first:pt-0">
                  <div>
                    <p className="text-sm font-semibold text-brand-brown">{item.name}</p>
                    {item.description && <p className="text-xs text-brand-mocha mt-0.5">{item.description}</p>}
                  </div>
                  {item.price !== undefined && item.price !== null && (
                    <span className="text-sm font-mono font-bold text-brand-brown whitespace-nowrap">₹{item.price}</span>
                  )}
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/booking/cafe-menu-section.test.tsx`
Expected: all 5 tests PASS.

- [ ] **Step 5: Render it on the public tenant page**

In `frontend/src/app/[tenant]/(public)/page.tsx`, add the import:

```tsx
import { CafeMenuSection } from '@/components/booking/cafe-menu-section';
```

and add `<CafeMenuSection />` right after the `<BookingCard />` block's closing `</div>` and before the `{/* Dynamic Template Info Card */}` comment / `<CafeInfoCard />` line, so the page reads (in order): Header, Hero, booking card, menu section, dining-policies card, footer.

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/booking/cafe-menu-section.tsx frontend/src/components/booking/cafe-menu-section.test.tsx "frontend/src/app/[tenant]/(public)/page.tsx"
git commit -m "feat: show cafe menu on the public storefront page"
```

---

### Task 5: Frontend — cover Hero.tsx's now-reachable description/hero_image_url rendering

**Files:**
- Create: `frontend/src/components/booking/hero.test.tsx`

**Interfaces:**
- Consumes: `Hero` from `@/components/booking/hero.tsx` (unchanged — this task adds test coverage only, no implementation changes, since the rendering logic already exists and this feature is what finally makes the backend send real values for it).

- [ ] **Step 1: Write the tests**

Create `frontend/src/components/booking/hero.test.tsx`:

```tsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Hero } from './hero';
import { useTenant } from '@/components/providers/tenant-provider';

vi.mock('@/components/providers/tenant-provider', () => ({
  useTenant: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () => (props: any) => <div {...props} />,
    }
  ),
}));

const baseCafe = {
  id: 'cafe_1',
  slug: 'demo-cafe',
  name: 'Demo Cafe',
  timezone: 'UTC',
  reservation_rules: {},
};

describe('Hero', () => {
  test('renders the cafe\'s actual description when set', () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: { ...baseCafe, description: 'The best filter coffee in town.' },
    } as any);
    render(<Hero />);

    expect(screen.getByText('The best filter coffee in town.')).toBeInTheDocument();
  });

  test('falls back to a generic sentence when no description is set', () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: { ...baseCafe } } as any);
    render(<Hero />);

    expect(screen.getByText(/effortless table reservations/i)).toBeInTheDocument();
  });

  test('renders the hero image when hero_image_url is set', () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: { ...baseCafe, hero_image_url: 'https://example.com/hero.jpg' },
    } as any);
    render(<Hero />);

    expect(screen.getByAltText('Demo Cafe')).toBeInTheDocument();
  });

  test('renders no image element when hero_image_url is not set', () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: { ...baseCafe } } as any);
    render(<Hero />);

    expect(screen.queryByAltText('Demo Cafe')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `cd frontend && npx vitest run src/components/booking/hero.test.tsx`
Expected: all 4 tests PASS immediately (no implementation change needed — this task documents and locks in behavior that already exists in `hero.tsx`). If any test fails, that reveals a real pre-existing bug in `Hero.tsx`'s current rendering logic — stop and report it rather than adjusting the test to match broken behavior.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/booking/hero.test.tsx
git commit -m "test: cover Hero's description/hero_image_url rendering, now reachable with real cafe data"
```

---

## Manual verification (after all tasks complete)

1. Start both servers (backend `npm run dev`, frontend `npm run dev`).
2. Log in as a cafe manager/owner, go to Cafe Settings, fill in a description, a hero image URL (any real image link), and add one or two menu categories with a few items (leave one item's price blank to confirm optional pricing works). Save.
3. Visit the cafe's public page (`/<slug>`) and confirm: the hero banner shows the new description and photo; a "Menu" section appears below the booking card, showing the categories (expanded by default, collapsible via the disclosure arrow) and items, with prices shown only where set.
4. Visit a *different* cafe's public page that has never touched these settings and confirm it looks exactly as it did before this feature (no empty "Menu" section, generic hero description).
