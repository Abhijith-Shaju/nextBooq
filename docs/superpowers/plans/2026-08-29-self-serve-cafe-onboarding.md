# Self-Serve Cafe Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a cafe owner sign up, declare themselves a cafe owner, and submit a cafe application that a platform admin reviews and approves — with the business address captured for verification and reused as cafe-managed storefront content.

**Architecture:** A new `CafeApplication` collection holds requests. Nothing enters live tenancy until a platform admin approves, at which point the existing `provisionCafe()` transaction runs unchanged in structure. The role prompt is an interstitial after email verification, gated on the `source=register` flag that only the control-plane register page sets, so the storefront's quick-auth is untouched. A shared `addressSchema` is used by both `CafeApplication` and `Cafe` so approval copies the subdocument verbatim.

**Tech Stack:** Backend — Node/Express 5, Mongoose 9, Jest + supertest + `mongodb-memory-server` replica set, Resend. Frontend — Next.js App Router, TypeScript, Tailwind, TanStack React Query, Vitest + Testing Library, sonner for toasts.

**Spec:** `docs/superpowers/specs/2026-08-29-self-serve-cafe-onboarding-design.md`

## Global Constraints

- **`account_type` is never authorization.** It is a UI hint only. Authorization stays derived from `staff_memberships`, `getOwnedOrgId()`, and `is_platform_admin`. No endpoint may grant access based on `account_type`.
- **`address` is optional at the Mongoose schema level, required at the input-validation layer.** Making it `required` on `Cafe` breaks every pre-existing cafe, because `updateCafe` and `updateCafePayments` both call `cafe.save()`, which validates the whole document.
- **Indian PIN pattern is exactly `/^[1-9][0-9]{5}$/`** — a leading zero is invalid.
- **`map_url` must pass the existing `isValidHttpsUrl`** (starts with `https://` and parses via `new URL()`). This is what keeps a `javascript:` URL out of a rendered `href`.
- **Application reference format is `NB-XXXX-XXXX`** using the alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (Crockford-style: no `I`, `L`, `O`, `U`).
- **All email is fire-and-forget with `.catch`** — matching `registerUser` and `customerQuickAuth`. Email failure must never fail the write that triggered it.
- **All applicant-supplied values in email go through the existing `escapeHtml`**, and subject-line values have newlines stripped.
- Backend field naming is `snake_case` (matching every existing model). Frontend types mirror those names exactly.
- Backend tests: `cd backend && npx jest <path> --runInBand`. Frontend tests: `cd frontend && npx vitest run <path>`.
- Frontend must pass `npm run typecheck` and `npm run lint` in `frontend/`.

---

### Task 1: Shared address validation and extracted cafe-input helpers

Extract the slug/timezone/name validators out of `cafeProvisioningService.js` into a shared util, and add address validation beside them, so the provisioning service and the (later) application controller cannot drift.

**Files:**
- Create: `backend/src/utils/cafeInput.js`
- Create: `backend/src/models/address.js`
- Modify: `backend/src/services/cafeProvisioningService.js` (remove the local helpers, import them instead)
- Test: `backend/tests/unit/cafeInput.test.js`

**Interfaces:**
- Consumes: `BadRequestError` from `backend/src/utils/errors.js`.
- Produces:
  - `backend/src/utils/cafeInput.js` exports `normalizeSlug(value)`, `validateTimezone(value)`, `requiredName(value, field)`, `validateAddress(value)`, `RESERVED_SLUGS`, `SLUG_PATTERN`, `INDIAN_PIN_PATTERN`, `isValidHttpsUrl(value)`.
    `validateAddress` returns `{ line1, line2, landmark, city, state, postal_code, country, map_url }` with all keys present as trimmed strings, and throws `BadRequestError` otherwise.
  - `backend/src/models/address.js` exports `addressSchema` (a Mongoose schema with `{ _id: false }`).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/cafeInput.test.js`:

```js
const {
  normalizeSlug,
  validateTimezone,
  validateAddress,
  RESERVED_SLUGS,
  isValidHttpsUrl,
} = require('../../src/utils/cafeInput');

const validAddress = () => ({
  line1: '12 Church Street',
  line2: 'Ashok Nagar',
  landmark: 'Opposite the bookstore',
  city: 'Bengaluru',
  state: 'Karnataka',
  postal_code: '560001',
  map_url: 'https://maps.google.com/?q=12+Church+Street',
});

describe('normalizeSlug', () => {
  test('lowercases and trims a valid slug', () => {
    expect(normalizeSlug('  Filter-Kaapi  ')).toBe('filter-kaapi');
  });

  test('rejects slugs that are reserved', () => {
    for (const reserved of ['admin', 'api', 'auth', 'onboarding', 'pricing', 'org', 'profile']) {
      expect(() => normalizeSlug(reserved)).toThrow(/reserved/);
    }
  });

  test('rejects slugs outside the 3-63 character kebab-case shape', () => {
    expect(() => normalizeSlug('ab')).toThrow(/kebab-case/);
    expect(() => normalizeSlug('Not_Kebab')).toThrow(/kebab-case/);
    expect(() => normalizeSlug('-leading')).toThrow(/kebab-case/);
  });
});

describe('validateTimezone', () => {
  test('accepts a real IANA zone', () => {
    expect(validateTimezone('Asia/Kolkata')).toBe('Asia/Kolkata');
  });

  test('rejects a made-up zone', () => {
    expect(() => validateTimezone('Mars/Olympus')).toThrow(/IANA/);
  });
});

describe('isValidHttpsUrl', () => {
  test('accepts https and rejects everything else', () => {
    expect(isValidHttpsUrl('https://maps.google.com/?q=x')).toBe(true);
    expect(isValidHttpsUrl('http://maps.google.com')).toBe(false);
    expect(isValidHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isValidHttpsUrl('not a url')).toBe(false);
  });
});

describe('validateAddress', () => {
  test('returns every key trimmed, defaulting country to India', () => {
    const result = validateAddress({ ...validAddress(), line1: '  12 Church Street  ' });
    expect(result).toEqual({
      line1: '12 Church Street',
      line2: 'Ashok Nagar',
      landmark: 'Opposite the bookstore',
      city: 'Bengaluru',
      state: 'Karnataka',
      postal_code: '560001',
      country: 'India',
      map_url: 'https://maps.google.com/?q=12+Church+Street',
    });
  });

  test('allows the optional fields to be omitted entirely', () => {
    const result = validateAddress({
      line1: '12 Church Street',
      city: 'Bengaluru',
      state: 'Karnataka',
      postal_code: '560001',
    });
    expect(result.line2).toBe('');
    expect(result.landmark).toBe('');
    expect(result.map_url).toBe('');
  });

  test.each(['line1', 'city', 'state', 'postal_code'])('requires %s', (field) => {
    const address = validAddress();
    delete address[field];
    expect(() => validateAddress(address)).toThrow(new RegExp(`address.${field}`));
  });

  test('rejects a PIN with a leading zero', () => {
    expect(() => validateAddress({ ...validAddress(), postal_code: '060001' })).toThrow(/6-digit/);
  });

  test('rejects a PIN that is not six digits', () => {
    expect(() => validateAddress({ ...validAddress(), postal_code: '56001' })).toThrow(/6-digit/);
    expect(() => validateAddress({ ...validAddress(), postal_code: '5600011' })).toThrow(/6-digit/);
  });

  test('rejects a non-https map_url', () => {
    expect(() => validateAddress({ ...validAddress(), map_url: 'http://maps.google.com' })).toThrow(/https/);
    expect(() => validateAddress({ ...validAddress(), map_url: 'javascript:alert(1)' })).toThrow(/https/);
  });

  test('rejects a map_url longer than 500 characters', () => {
    const long = `https://maps.google.com/?q=${'a'.repeat(500)}`;
    expect(() => validateAddress({ ...validAddress(), map_url: long })).toThrow(/500/);
  });

  test('rejects a non-object', () => {
    expect(() => validateAddress(null)).toThrow(/address is required/);
    expect(() => validateAddress('12 Church Street')).toThrow(/address is required/);
  });
});

describe('RESERVED_SLUGS', () => {
  test('covers every top-level control-plane route', () => {
    for (const reserved of ['admin', 'api', 'auth', 'onboarding', 'pricing', '_next', 'org', 'profile']) {
      expect(RESERVED_SLUGS.has(reserved)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/unit/cafeInput.test.js --runInBand`
Expected: FAIL — `Cannot find module '../../src/utils/cafeInput'`.

- [ ] **Step 3: Write `backend/src/utils/cafeInput.js`**

Move the helpers verbatim out of `cafeProvisioningService.js` (do not re-derive them), add `org` and `profile` to `RESERVED_SLUGS`, and add the address validator:

```js
const { BadRequestError } = require('./errors');

const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'auth',
  'onboarding',
  'pricing',
  '_next',
  // Added with self-serve onboarding: a static Next.js segment always wins
  // over the [tenant] dynamic segment, so a cafe on either of these slugs
  // could never render.
  'org',
  'profile',
]);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INDIAN_PIN_PATTERN = /^[1-9][0-9]{5}$/;

const MAX_MAP_URL_LENGTH = 500;
const ADDRESS_MAX_LENGTHS = {
  line1: 200,
  line2: 200,
  landmark: 120,
  city: 100,
  state: 100,
  country: 100,
};

const requiredName = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestError(`${field} is required`);
  }
  return value.trim();
};

const normalizeSlug = (value) => {
  if (typeof value !== 'string') {
    throw new BadRequestError('cafe.slug is required');
  }
  const slug = value.trim().toLowerCase();
  if (slug.length < 3 || slug.length > 63 || !SLUG_PATTERN.test(slug)) {
    throw new BadRequestError('cafe.slug must be a 3-63 character kebab-case value');
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new BadRequestError('cafe.slug is reserved');
  }
  return slug;
};

const validateTimezone = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestError('cafe.timezone is required');
  }
  const timezone = value.trim();
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch (_) {
    throw new BadRequestError('cafe.timezone must be a valid IANA timezone');
  }
  return timezone;
};

const isValidHttpsUrl = (value) => {
  if (typeof value !== 'string' || !value.startsWith('https://')) {
    return false;
  }
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const optionalAddressField = (value, field) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new BadRequestError(`address.${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > ADDRESS_MAX_LENGTHS[field]) {
    throw new BadRequestError(`address.${field} must be ${ADDRESS_MAX_LENGTHS[field]} characters or fewer`);
  }
  return trimmed;
};

const requiredAddressField = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestError(`address.${field} is required`);
  }
  return optionalAddressField(value, field);
};

/**
 * The single validator for a cafe's postal address, shared by cafe
 * provisioning and by self-serve cafe applications so the two can never
 * drift. Returns every key present as a trimmed string.
 */
const validateAddress = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestError('address is required');
  }

  const postalCode = typeof value.postal_code === 'string' ? value.postal_code.trim() : '';
  if (!postalCode) {
    throw new BadRequestError('address.postal_code is required');
  }
  if (!INDIAN_PIN_PATTERN.test(postalCode)) {
    throw new BadRequestError('address.postal_code must be a 6-digit Indian PIN code');
  }

  let mapUrl = '';
  if (value.map_url !== undefined && value.map_url !== null && value.map_url !== '') {
    if (typeof value.map_url !== 'string') {
      throw new BadRequestError('address.map_url must be a string');
    }
    mapUrl = value.map_url.trim();
    if (mapUrl.length > MAX_MAP_URL_LENGTH) {
      throw new BadRequestError(`address.map_url must be ${MAX_MAP_URL_LENGTH} characters or fewer`);
    }
    if (!isValidHttpsUrl(mapUrl)) {
      throw new BadRequestError('address.map_url must be an https URL');
    }
  }

  return {
    line1: requiredAddressField(value.line1, 'line1'),
    line2: optionalAddressField(value.line2, 'line2'),
    landmark: optionalAddressField(value.landmark, 'landmark'),
    city: requiredAddressField(value.city, 'city'),
    state: requiredAddressField(value.state, 'state'),
    postal_code: postalCode,
    country: optionalAddressField(value.country, 'country') || 'India',
    map_url: mapUrl,
  };
};

module.exports = {
  RESERVED_SLUGS,
  SLUG_PATTERN,
  INDIAN_PIN_PATTERN,
  requiredName,
  normalizeSlug,
  validateTimezone,
  isValidHttpsUrl,
  validateAddress,
};
```

- [ ] **Step 4: Write `backend/src/models/address.js`**

```js
const mongoose = require('mongoose');

// Shared by Cafe and CafeApplication so approving an application can copy
// the subdocument across verbatim, with no field mapping to drift.
// Deliberately has no `required` fields: requiring them here would make every
// pre-existing addressless Cafe fail validation on its next save() (see
// updateCafe / updateCafePayments). Requiredness is enforced at the input
// layer by validateAddress in utils/cafeInput.js.
const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, trim: true, maxlength: 200, default: '' },
    line2: { type: String, trim: true, maxlength: 200, default: '' },
    landmark: { type: String, trim: true, maxlength: 120, default: '' },
    city: { type: String, trim: true, maxlength: 100, default: '' },
    state: { type: String, trim: true, maxlength: 100, default: '' },
    postal_code: { type: String, trim: true, maxlength: 10, default: '' },
    country: { type: String, trim: true, maxlength: 100, default: 'India' },
    map_url: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { _id: false }
);

module.exports = { addressSchema };
```

- [ ] **Step 5: Rewire `cafeProvisioningService.js` to import the helpers**

Delete the now-duplicated `RESERVED_SLUGS`, `SLUG_PATTERN`, `requiredName`, `normalizeSlug`, and `validateTimezone` definitions from `backend/src/services/cafeProvisioningService.js` and add near the other requires:

```js
const {
  requiredName,
  normalizeSlug,
  validateTimezone,
  validateAddress,
} = require('../utils/cafeInput');
```

Leave `asObjectId`, `normalizeSubscription`, and `normalizeOrganization` where they are — they are provisioning-specific. Do not change behaviour in this step; `validateAddress` is wired up in Task 2.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && npx jest tests/unit/cafeInput.test.js tests/integration/cafeProvisioning.test.js --runInBand`
Expected: PASS. The provisioning suite must still pass unchanged — this step is a pure extraction.

- [ ] **Step 7: Commit**

```bash
git add backend/src/utils/cafeInput.js backend/src/models/address.js backend/src/services/cafeProvisioningService.js backend/tests/unit/cafeInput.test.js
git commit -m "refactor: extract shared cafe input validators and add address validation"
```

---

### Task 2: Cafe gains address and geo point; provisioning requires an address

**Files:**
- Modify: `backend/src/models/Cafe.js`
- Modify: `backend/src/services/cafeProvisioningService.js`
- Modify: `backend/tests/integration/cafeProvisioning.test.js` (existing payloads need an address)
- Modify: `backend/tests/integration/platformAdminRoutes.test.js` (same)
- Test: `backend/tests/integration/cafeAddress.test.js`

**Interfaces:**
- Consumes: `validateAddress` and the helpers from Task 1; `addressSchema` from `backend/src/models/address.js`.
- Produces: `Cafe` documents carry `address` (addressSchema) and an optional `location` GeoJSON Point. `provisionCafe(input)` now requires `input.cafe.address`, and writes it to the created Cafe.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/cafeAddress.test.js`:

```js
const mongoose = require('mongoose');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const { provisionCafe } = require('../../src/services/cafeProvisioningService');
const { setupTestDB } = require('../setup');

setupTestDB();

const address = () => ({
  line1: '12 Church Street',
  city: 'Bengaluru',
  state: 'Karnataka',
  postal_code: '560001',
  map_url: 'https://maps.google.com/?q=12+Church+Street',
});

const makeUsers = async () => {
  const owner = await User.create({
    name: 'Owner', email: 'address-owner@example.com', phone: '+15550120001', password_hash: 'x',
  });
  const admin = await User.create({
    name: 'Admin', email: 'address-admin@example.com', phone: '+15550120002', password_hash: 'x', is_platform_admin: true,
  });
  return { owner, admin };
};

const payload = (owner, admin, overrides = {}) => ({
  owner_user_id: owner._id.toString(),
  adminUserId: admin._id.toString(),
  organization: { mode: 'new', name: 'Address Organization' },
  cafe: { name: 'Address Cafe', slug: 'address-cafe', timezone: 'Asia/Kolkata', address: address() },
  subscription: { status: 'trial', term_months: 1, price_per_month: 0 },
  ...overrides,
});

describe('cafe address and geo point', () => {
  test('provisioning writes the address onto the cafe', async () => {
    const { owner, admin } = await makeUsers();
    const result = await provisionCafe(payload(owner, admin));

    const cafe = await Cafe.findById(result.cafe.id);
    expect(cafe.address.line1).toBe('12 Church Street');
    expect(cafe.address.city).toBe('Bengaluru');
    expect(cafe.address.postal_code).toBe('560001');
    expect(cafe.address.country).toBe('India');
    expect(cafe.address.map_url).toBe('https://maps.google.com/?q=12+Church+Street');
  });

  test('provisioning rejects a missing address and writes nothing', async () => {
    const { owner, admin } = await makeUsers();
    const body = payload(owner, admin);
    delete body.cafe.address;

    await expect(provisionCafe(body)).rejects.toThrow(/address is required/);
    expect(await Cafe.countDocuments()).toBe(0);
    expect(await Organization.countDocuments()).toBe(0);
  });

  test('provisioning rejects an invalid PIN and writes nothing', async () => {
    const { owner, admin } = await makeUsers();
    const body = payload(owner, admin);
    body.cafe.address.postal_code = '060001';

    await expect(provisionCafe(body)).rejects.toThrow(/6-digit/);
    expect(await Cafe.countDocuments()).toBe(0);
  });

  test('a cafe created without an address still saves (pre-existing cafes must not break)', async () => {
    const org = await Organization.create({ name: 'Legacy Organization' });
    const legacy = await Cafe.create({
      org_id: org._id, name: 'Legacy Cafe', slug: 'legacy-cafe', timezone: 'UTC',
    });

    legacy.contact_phone = '+91 98765 43210';
    await expect(legacy.save()).resolves.toBeDefined();
  });

  test('location supports a 2dsphere near query once set', async () => {
    const org = await Organization.create({ name: 'Geo Organization' });
    await Cafe.create({
      org_id: org._id, name: 'Geo Cafe', slug: 'geo-cafe', timezone: 'Asia/Kolkata',
      location: { type: 'Point', coordinates: [77.6033, 12.9716] },
    });
    await Cafe.init(); // ensure indexes are built before querying

    const near = await Cafe.find({
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [77.6, 12.97] },
          $maxDistance: 5000,
        },
      },
    });
    expect(near).toHaveLength(1);
    expect(near[0].slug).toBe('geo-cafe');
  });

  test('cafes without a location are simply absent from a near query', async () => {
    const org = await Organization.create({ name: 'Mixed Organization' });
    await Cafe.create({ org_id: org._id, name: 'No Geo', slug: 'no-geo-cafe', timezone: 'UTC' });
    await Cafe.init();

    const near = await Cafe.find({
      location: { $near: { $geometry: { type: 'Point', coordinates: [77.6, 12.97] }, $maxDistance: 5000 } },
    });
    expect(near).toHaveLength(0);
  });
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) await mongoose.connection.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/cafeAddress.test.js --runInBand`
Expected: FAIL — the address is not persisted and `provisionCafe` accepts a payload with no address.

- [ ] **Step 3: Add the fields to `backend/src/models/Cafe.js`**

Add the import at the top:

```js
const { addressSchema } = require('./address');
```

Add these fields inside the schema, immediately after `contact_phone`:

```js
    // Captured during onboarding for verification, then editable by the cafe
    // in its own settings and surfaced on the storefront. Optional at the
    // schema level on purpose — see models/address.js.
    address: {
      type: addressSchema,
      default: () => ({}),
    },
    // GeoJSON [longitude, latitude]. Deliberately unset for now: nothing
    // geocodes an address yet. The 2dsphere index below skips documents
    // missing this field, so it is inert until a "cafes near you" feature
    // populates it — at which point $near works with no migration.
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] },
    },
```

Add the index just above the `redactPaymentSecrets` transform:

```js
cafeSchema.index({ location: '2dsphere' });
```

- [ ] **Step 4: Require the address in `provisionCafe`**

In `backend/src/services/cafeProvisioningService.js`, inside `validateProvisionInput`, extend the returned `cafe` object:

```js
    cafe: {
      name: requiredName(input.cafe.name, 'cafe.name'),
      slug: normalizeSlug(input.cafe.slug),
      timezone: validateTimezone(input.cafe.timezone),
      address: validateAddress(input.cafe.address),
    },
```

And in `provisionCafe`, pass it through when constructing the Cafe:

```js
    const cafe = new Cafe({
      org_id: organization._id,
      name: data.cafe.name,
      slug: data.cafe.slug,
      timezone: data.cafe.timezone,
      address: data.cafe.address,
      subscription_status: data.subscription.status,
    });
```

- [ ] **Step 5: Update the existing provisioning test payloads**

`provisionCafe` now rejects addressless payloads, so the two existing suites that build payloads need one added.

In `backend/tests/integration/cafeProvisioning.test.js`, change `payloadFor` so its `cafe` object carries an address:

```js
const payloadFor = (ownerUserId, overrides = {}) => ({
  owner_user_id: ownerUserId.toString(),
  organization: { mode: 'new', name: 'Provisioning Organization' },
  cafe: {
    name: 'Provisioning Cafe',
    slug: 'provisioning-cafe',
    timezone: 'Asia/Kolkata',
    address: {
      line1: '12 Church Street',
      city: 'Bengaluru',
      state: 'Karnataka',
      postal_code: '560001',
    },
  },
  subscription: { status: 'active', term_months: 12, price_per_month: 7000, note: 'Paid by admin' },
  ...overrides,
});
```

Then run `cd backend && npx jest tests/integration/platformAdminRoutes.test.js --runInBand` and add the same `address` block to any provisioning payload that suite builds. Do not weaken an assertion to make a test pass — only add the new required field.

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && npx jest --runInBand`
Expected: PASS, including `cafeAddress.test.js`. If another suite fails on a missing address, add the address to its payload.

- [ ] **Step 7: Commit**

```bash
git add backend/src/models/Cafe.js backend/src/services/cafeProvisioningService.js backend/tests/
git commit -m "feat: store a structured address and geo point on cafes"
```

---

### Task 3: CafeApplication model and reference generator

**Files:**
- Create: `backend/src/models/CafeApplication.js`
- Create: `backend/src/utils/applicationRef.js`
- Test: `backend/tests/unit/applicationRef.test.js`
- Test: `backend/tests/integration/cafeApplicationModel.test.js`

**Interfaces:**
- Consumes: `addressSchema` from Task 1.
- Produces:
  - `backend/src/utils/applicationRef.js` exports `generateApplicationRef()` returning a string like `NB-7K2M-9QRT`, and `APPLICATION_REF_ALPHABET`, and `APPLICATION_REF_PATTERN` (`/^NB-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/`).
  - `backend/src/models/CafeApplication.js` exports the `CafeApplication` model with statuses `pending | approved | rejected | withdrawn`, and a partial unique index on `applicant_user_id` where `status: 'pending'`.

- [ ] **Step 1: Write the failing unit test**

Create `backend/tests/unit/applicationRef.test.js`:

```js
const {
  generateApplicationRef,
  APPLICATION_REF_ALPHABET,
  APPLICATION_REF_PATTERN,
} = require('../../src/utils/applicationRef');

describe('generateApplicationRef', () => {
  test('matches the NB-XXXX-XXXX shape', () => {
    expect(generateApplicationRef()).toMatch(APPLICATION_REF_PATTERN);
  });

  test('never emits the ambiguous characters I, L, O or U', () => {
    const alphabet = APPLICATION_REF_ALPHABET;
    for (const ambiguous of ['I', 'L', 'O', 'U']) {
      expect(alphabet).not.toContain(ambiguous);
    }
    const refs = Array.from({ length: 200 }, () => generateApplicationRef());
    for (const ref of refs) {
      expect(ref.replace(/^NB-/, '').replace('-', '')).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    }
  });

  test('produces distinct values across many calls', () => {
    const refs = new Set(Array.from({ length: 500 }, () => generateApplicationRef()));
    expect(refs.size).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/unit/applicationRef.test.js --runInBand`
Expected: FAIL — `Cannot find module '../../src/utils/applicationRef'`.

- [ ] **Step 3: Write `backend/src/utils/applicationRef.js`**

```js
const crypto = require('crypto');

// Crockford-style alphabet: I, L, O and U are removed so a reference read
// aloud or retyped from an email can't be confused with 1, 0 or V.
const APPLICATION_REF_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const APPLICATION_REF_PATTERN = /^NB-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

const randomBlock = (length) => {
  let block = '';
  for (let i = 0; i < length; i += 1) {
    block += APPLICATION_REF_ALPHABET[crypto.randomInt(APPLICATION_REF_ALPHABET.length)];
  }
  return block;
};

// Random rather than sequential: a counter needs its own collection and
// races under concurrent submissions, and a sequential id would leak the
// platform's total application volume to every applicant.
const generateApplicationRef = () => `NB-${randomBlock(4)}-${randomBlock(4)}`;

module.exports = { generateApplicationRef, APPLICATION_REF_ALPHABET, APPLICATION_REF_PATTERN };
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `cd backend && npx jest tests/unit/applicationRef.test.js --runInBand`
Expected: PASS.

- [ ] **Step 5: Write the failing model test**

Create `backend/tests/integration/cafeApplicationModel.test.js`:

```js
const CafeApplication = require('../../src/models/CafeApplication');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');

setupTestDB();

const makeUser = (email, phone) =>
  User.create({ name: 'Applicant', email, phone, password_hash: 'x' });

const applicationFor = (user, overrides = {}) => ({
  application_ref: 'NB-7K2M-9QRT',
  applicant_user_id: user._id,
  organization_name: 'Filter Kaapi Co',
  cafe_name: 'Filter Kaapi',
  cafe_slug: 'filter-kaapi',
  timezone: 'Asia/Kolkata',
  address: { line1: '12 Church Street', city: 'Bengaluru', state: 'Karnataka', postal_code: '560001' },
  ...overrides,
});

describe('CafeApplication model', () => {
  test('defaults a new application to pending', async () => {
    const user = await makeUser('model-a@example.com', '+15550130001');
    const application = await CafeApplication.create(applicationFor(user));
    expect(application.status).toBe('pending');
    expect(application.reviewed_at).toBeNull();
    expect(application.provisioned_cafe_id).toBeNull();
  });

  test('rejects a second pending application from the same user', async () => {
    const user = await makeUser('model-b@example.com', '+15550130002');
    await CafeApplication.init();
    await CafeApplication.create(applicationFor(user));

    await expect(
      CafeApplication.create(applicationFor(user, { application_ref: 'NB-AAAA-BBBB', cafe_slug: 'second-cafe' }))
    ).rejects.toMatchObject({ code: 11000 });
  });

  test('allows a new application once the previous one is rejected', async () => {
    const user = await makeUser('model-c@example.com', '+15550130003');
    await CafeApplication.init();
    const first = await CafeApplication.create(applicationFor(user));
    first.status = 'rejected';
    first.review_note = 'Could not verify the address';
    await first.save();

    const second = await CafeApplication.create(
      applicationFor(user, { application_ref: 'NB-CCCC-DDDD', cafe_slug: 'retry-cafe' })
    );
    expect(second.status).toBe('pending');
  });

  test('rejects a duplicate application_ref', async () => {
    const one = await makeUser('model-d@example.com', '+15550130004');
    const two = await makeUser('model-e@example.com', '+15550130005');
    await CafeApplication.init();
    await CafeApplication.create(applicationFor(one));

    await expect(
      CafeApplication.create(applicationFor(two, { cafe_slug: 'other-cafe' }))
    ).rejects.toMatchObject({ code: 11000 });
  });

  test('rejects an unknown status', async () => {
    const user = await makeUser('model-f@example.com', '+15550130006');
    await expect(
      CafeApplication.create(applicationFor(user, { status: 'maybe' }))
    ).rejects.toThrow(/status/);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/cafeApplicationModel.test.js --runInBand`
Expected: FAIL — `Cannot find module '../../src/models/CafeApplication'`.

- [ ] **Step 7: Write `backend/src/models/CafeApplication.js`**

```js
const mongoose = require('mongoose');
const { addressSchema } = require('./address');

// A cafe owner's request to have a cafe provisioned. Deliberately holds no
// Organization, Cafe, Subscription or staff membership: nothing enters live
// tenancy until a platform admin approves, at which point the existing
// provisionCafe() transaction is the sole writer.
const cafeApplicationSchema = new mongoose.Schema(
  {
    // Human-readable handle shared between the applicant's status screen and
    // the review email, so both sides can refer to the same string.
    application_ref: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    applicant_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    organization_name: { type: String, required: true, trim: true },
    cafe_name: { type: String, required: true, trim: true },
    cafe_slug: { type: String, required: true, lowercase: true, trim: true },
    timezone: { type: String, required: true, trim: true },
    address: { type: addressSchema, default: () => ({}) },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'withdrawn'],
      default: 'pending',
    },
    // Shown to the applicant on rejection, so they know what to fix.
    review_note: { type: String, trim: true, maxlength: 1000, default: '' },
    reviewed_by_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewed_at: { type: Date, default: null },
    provisioned_cafe_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Cafe', default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// One open application per user, enforced in the database rather than by a
// read-then-write check in the controller, so two concurrent submissions
// cannot both win.
cafeApplicationSchema.index(
  { applicant_user_id: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

// The admin review queue, newest first.
cafeApplicationSchema.index({ status: 1, created_at: -1 });

module.exports = mongoose.model('CafeApplication', cafeApplicationSchema);
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd backend && npx jest tests/unit/applicationRef.test.js tests/integration/cafeApplicationModel.test.js --runInBand`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/models/CafeApplication.js backend/src/utils/applicationRef.js backend/tests/unit/applicationRef.test.js backend/tests/integration/cafeApplicationModel.test.js
git commit -m "feat: add CafeApplication model and application reference generator"
```

---

### Task 4: User account type and auth payload

**Files:**
- Modify: `backend/src/models/User.js`
- Modify: `backend/src/utils/authUserResponse.js`
- Modify: `backend/src/controllers/authController.js`
- Modify: `backend/src/routes/v1/authRoutes.js`
- Test: `backend/tests/integration/accountType.test.js`

**Interfaces:**
- Consumes: `CafeApplication` from Task 3.
- Produces:
  - `User.account_type` — `'customer' | 'cafe_owner' | null`.
  - `buildAuthUserPayload(user, { ownerOrgId, cafeApplication })` now emits `account_type` and `cafe_application`, where `cafe_application` is `null` or `{ id, application_ref, status, cafe_slug }`.
  - `getLatestApplicationSummary(userId)` exported from `backend/src/services/cafeApplicationService.js`, returning that same shape or `null`.
  - `PATCH /api/v1/auth/account-type` accepting `{ account_type }`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/accountType.test.js`:

```js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const User = require('../../src/models/User');
const CafeApplication = require('../../src/models/CafeApplication');
const { setupTestDB } = require('../setup');

setupTestDB();

const makeUser = (overrides = {}) =>
  User.create({
    name: 'Account Type User',
    email: 'account-type@example.com',
    phone: '+15550140001',
    password_hash: 'x',
    is_email_verified: true,
    ...overrides,
  });

const bearer = (user) => jwt.sign({ id: user._id.toString(), tv: user.token_version }, config.JWT_SECRET);

describe('PATCH /api/v1/auth/account-type', () => {
  test('rejects an unauthenticated caller', async () => {
    const res = await request(app).patch('/api/v1/auth/account-type').send({ account_type: 'cafe_owner' });
    expect(res.status).toBe(401);
  });

  test('records a valid account type and returns it on the user payload', async () => {
    const user = await makeUser();
    const res = await request(app)
      .patch('/api/v1/auth/account-type')
      .set('Authorization', `Bearer ${bearer(user)}`)
      .send({ account_type: 'cafe_owner' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.account_type).toBe('cafe_owner');
    expect(await User.findById(user._id)).toMatchObject({ account_type: 'cafe_owner' });
  });

  test('rejects an unknown account type', async () => {
    const user = await makeUser({ email: 'bad-type@example.com', phone: '+15550140002' });
    const res = await request(app)
      .patch('/api/v1/auth/account-type')
      .set('Authorization', `Bearer ${bearer(user)}`)
      .send({ account_type: 'platform_admin' });

    expect(res.status).toBe(400);
    expect(await User.findById(user._id)).toMatchObject({ account_type: null });
  });

  test('setting account_type grants no privilege', async () => {
    const user = await makeUser({ email: 'no-privilege@example.com', phone: '+15550140003' });
    await request(app)
      .patch('/api/v1/auth/account-type')
      .set('Authorization', `Bearer ${bearer(user)}`)
      .send({ account_type: 'cafe_owner' });

    const [me, admin, org] = await Promise.all([
      request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${bearer(user)}`),
      request(app).get('/api/v1/platform-admin/overview').set('Authorization', `Bearer ${bearer(user)}`),
      request(app).get('/api/v1/org').set('Authorization', `Bearer ${bearer(user)}`),
    ]);

    expect(me.body.data.user.owner_org_id).toBeNull();
    expect(me.body.data.user.is_platform_admin).toBe(false);
    expect(admin.status).toBe(403);
    expect(org.status).toBe(403);
  });
});

describe('GET /api/v1/auth/me cafe_application', () => {
  test('is null when the user has never applied', async () => {
    const user = await makeUser({ email: 'never-applied@example.com', phone: '+15550140004' });
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${bearer(user)}`);
    expect(res.body.data.user.cafe_application).toBeNull();
  });

  test('summarises the latest application', async () => {
    const user = await makeUser({ email: 'has-applied@example.com', phone: '+15550140005' });
    await CafeApplication.create({
      application_ref: 'NB-7K2M-9QRT',
      applicant_user_id: user._id,
      organization_name: 'Filter Kaapi Co',
      cafe_name: 'Filter Kaapi',
      cafe_slug: 'filter-kaapi',
      timezone: 'Asia/Kolkata',
      address: { line1: '12 Church Street', city: 'Bengaluru', state: 'Karnataka', postal_code: '560001' },
    });

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${bearer(user)}`);
    expect(res.body.data.user.cafe_application).toMatchObject({
      application_ref: 'NB-7K2M-9QRT',
      status: 'pending',
      cafe_slug: 'filter-kaapi',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/accountType.test.js --runInBand`
Expected: FAIL — 404 on the PATCH route, and `cafe_application` undefined on the `/me` payload.

- [ ] **Step 3: Add `account_type` to `backend/src/models/User.js`**

Add immediately after `is_platform_admin`:

```js
    // Which surface this account said it was for, captured once after email
    // verification. A UI hint only: it decides where the browser goes next
    // and whether to re-prompt. It is NEVER an authorization signal — access
    // stays derived from staff_memberships, getOwnedOrgId() and
    // is_platform_admin.
    account_type: {
      type: String,
      enum: ['customer', 'cafe_owner'],
      default: null,
    },
```

- [ ] **Step 4: Create `backend/src/services/cafeApplicationService.js` with the summary helper**

```js
const CafeApplication = require('../models/CafeApplication');

const summarize = (application) =>
  application
    ? {
        id: application._id.toString(),
        application_ref: application.application_ref,
        status: application.status,
        cafe_slug: application.cafe_slug,
        cafe_name: application.cafe_name,
        created_at: application.created_at,
        review_note: application.review_note || '',
      }
    : null;

// The applicant's most recent application, whatever its status — the profile
// card and onboarding screens key off this one record.
const getLatestApplicationSummary = async (userId) => {
  const application = await CafeApplication.findOne({ applicant_user_id: userId }).sort({ created_at: -1 });
  return summarize(application);
};

module.exports = { getLatestApplicationSummary, summarize };
```

- [ ] **Step 5: Extend `backend/src/utils/authUserResponse.js`**

```js
const buildAuthUserPayload = (user, { ownerOrgId = null, cafeApplication = null } = {}) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  is_platform_admin: Boolean(user.is_platform_admin),
  owner_org_id: ownerOrgId,
  account_type: user.account_type || null,
  cafe_application: cafeApplication,
  is_email_verified: Boolean(user.is_email_verified),
  pending_email: user.pending_email || null,
  created_at: user.created_at,
  staff_memberships: Array.isArray(user.staff_memberships)
    ? user.staff_memberships.filter((membership) => membership?.cafe_id)
    : [],
});
```

- [ ] **Step 6: Wire the controller**

In `backend/src/controllers/authController.js`, add the import:

```js
const { getLatestApplicationSummary } = require('../services/cafeApplicationService');
```

In both `loginUser` and `getMe`, load the summary alongside the owner org and pass it through. In `getMe` that reads:

```js
    const [ownerOrgId, cafeApplication] = await Promise.all([
      getOwnedOrgId(user),
      getLatestApplicationSummary(user._id),
    ]);
    ...
    buildAuthUserPayload(user, { ownerOrgId, cafeApplication })
```

Apply the same pair to `loginUser`. Leave `registerUser` as it is — a brand-new account has no application, and `cafeApplication` already defaults to `null`.

Add the new handler near `changePhone`:

```js
const ACCOUNT_TYPES = ['customer', 'cafe_owner'];

// Records which surface the account is for so the control-plane onboarding
// prompt is only ever shown once. Purely a navigation hint — see the comment
// on User.account_type.
const updateAccountType = async (req, res, next) => {
  try {
    const { account_type } = req.body;
    if (!ACCOUNT_TYPES.includes(account_type)) {
      throw new BadRequestError(`account_type must be one of ${ACCOUNT_TYPES.join(', ')}`);
    }

    const user = await User.findById(req.user._id).populate(ACTIVE_STAFF_MEMBERSHIP_POPULATE);
    user.account_type = account_type;
    await user.save();

    const [ownerOrgId, cafeApplication] = await Promise.all([
      getOwnedOrgId(user),
      getLatestApplicationSummary(user._id),
    ]);

    res.status(200).json({
      status: 'success',
      data: { user: buildAuthUserPayload(user, { ownerOrgId, cafeApplication }) },
    });
  } catch (error) {
    next(error);
  }
};
```

Add `updateAccountType` to the `module.exports` list at the bottom of the file.

- [ ] **Step 7: Register the route**

In `backend/src/routes/v1/authRoutes.js`, add `updateAccountType` to the destructured import and register it beneath the other authenticated routes:

```js
router.patch('/account-type', authenticate, updateAccountType);
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd backend && npx jest tests/integration/accountType.test.js tests/integration/cookieAuth.test.js tests/integration/authAccountSemantics.test.js --runInBand`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/models/User.js backend/src/utils/authUserResponse.js backend/src/services/cafeApplicationService.js backend/src/controllers/authController.js backend/src/routes/v1/authRoutes.js backend/tests/integration/accountType.test.js
git commit -m "feat: record account type and expose cafe application status on the auth payload"
```

---

### Task 5: Applicant-facing cafe application endpoints

**Files:**
- Modify: `backend/src/middleware/rateLimiter.js`
- Modify: `backend/src/services/cafeApplicationService.js`
- Create: `backend/src/controllers/cafeApplicationController.js`
- Create: `backend/src/routes/v1/cafeApplicationRoutes.js`
- Modify: `backend/src/routes/index.js`
- Test: `backend/tests/integration/cafeApplicationSubmit.test.js`

**Interfaces:**
- Consumes: `CafeApplication`, `generateApplicationRef`, `validateAddress`/`normalizeSlug`/`validateTimezone`/`requiredName`, `summarize` from Task 4.
- Produces:
  - `cafeApplicationService.createApplication({ user, body })` → the `summarize`d application. Throws `ForbiddenError` when the email is unverified, `ConflictError` when one is already pending, `BadRequestError` on validation failure (including a taken slug).
  - `cafeApplicationService.withdrawApplication(userId)` → the withdrawn summary, or throws `NotFoundError`.
  - `POST /api/v1/cafe-applications`, `GET /api/v1/cafe-applications/mine`, `DELETE /api/v1/cafe-applications/mine`.
  - `cafeApplicationRateLimiter` exported from `backend/src/middleware/rateLimiter.js`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/cafeApplicationSubmit.test.js`:

```js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const User = require('../../src/models/User');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const CafeApplication = require('../../src/models/CafeApplication');
const { APPLICATION_REF_PATTERN } = require('../../src/utils/applicationRef');
const { setupTestDB } = require('../setup');

setupTestDB();

const makeUser = (overrides = {}) =>
  User.create({
    name: 'Applicant',
    email: `applicant-${Math.random().toString(36).slice(2)}@example.com`,
    phone: `+1555015${Math.floor(1000 + Math.random() * 8999)}`,
    password_hash: 'x',
    is_email_verified: true,
    ...overrides,
  });

const bearer = (user) => jwt.sign({ id: user._id.toString(), tv: user.token_version }, config.JWT_SECRET);

const body = (overrides = {}) => ({
  organization_name: 'Filter Kaapi Co',
  cafe_name: 'Filter Kaapi',
  cafe_slug: 'filter-kaapi',
  timezone: 'Asia/Kolkata',
  address: {
    line1: '12 Church Street',
    city: 'Bengaluru',
    state: 'Karnataka',
    postal_code: '560001',
    map_url: 'https://maps.google.com/?q=filter+kaapi',
  },
  ...overrides,
});

const submit = (user, payload = body()) =>
  request(app).post('/api/v1/cafe-applications').set('Authorization', `Bearer ${bearer(user)}`).send(payload);

describe('POST /api/v1/cafe-applications', () => {
  test('rejects an unauthenticated caller', async () => {
    const res = await request(app).post('/api/v1/cafe-applications').send(body());
    expect(res.status).toBe(401);
    expect(await CafeApplication.countDocuments()).toBe(0);
  });

  test('rejects an unverified email', async () => {
    const user = await makeUser({ is_email_verified: false });
    const res = await submit(user);
    expect(res.status).toBe(403);
    expect(await CafeApplication.countDocuments()).toBe(0);
  });

  test('creates a pending application with a reference', async () => {
    const user = await makeUser();
    const res = await submit(user);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.application_ref).toMatch(APPLICATION_REF_PATTERN);

    const stored = await CafeApplication.findOne({ applicant_user_id: user._id });
    expect(stored.cafe_slug).toBe('filter-kaapi');
    expect(stored.address.city).toBe('Bengaluru');
    expect(stored.address.country).toBe('India');
  });

  test('rejects a second pending application', async () => {
    const user = await makeUser();
    await submit(user);
    const res = await submit(user, body({ cafe_slug: 'second-cafe' }));

    expect(res.status).toBe(409);
    expect(await CafeApplication.countDocuments({ applicant_user_id: user._id })).toBe(1);
  });

  test('rejects a slug that an existing cafe already holds', async () => {
    const org = await Organization.create({ name: 'Existing Organization' });
    await Cafe.create({ org_id: org._id, name: 'Existing', slug: 'filter-kaapi', timezone: 'UTC' });

    const user = await makeUser();
    const res = await submit(user);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/already/i);
  });

  test('rejects a slug another pending application already requested', async () => {
    const first = await makeUser();
    await submit(first);

    const second = await makeUser();
    const res = await submit(second);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/already/i);
  });

  test('rejects a reserved slug', async () => {
    const user = await makeUser();
    const res = await submit(user, body({ cafe_slug: 'profile' }));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/reserved/);
  });

  test('rejects an invalid PIN', async () => {
    const user = await makeUser();
    const res = await submit(user, body({ address: { ...body().address, postal_code: '060001' } }));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/6-digit/);
  });
});

describe('GET and DELETE /api/v1/cafe-applications/mine', () => {
  test('returns null when the user has never applied', async () => {
    const user = await makeUser();
    const res = await request(app)
      .get('/api/v1/cafe-applications/mine')
      .set('Authorization', `Bearer ${bearer(user)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  test('returns only the caller own application', async () => {
    const mine = await makeUser();
    const theirs = await makeUser();
    await submit(mine);
    await submit(theirs, body({ cafe_slug: 'their-cafe' }));

    const res = await request(app)
      .get('/api/v1/cafe-applications/mine')
      .set('Authorization', `Bearer ${bearer(theirs)}`);
    expect(res.body.data.cafe_slug).toBe('their-cafe');
  });

  test('withdraws a pending application and frees the slug', async () => {
    const user = await makeUser();
    await submit(user);

    const withdraw = await request(app)
      .delete('/api/v1/cafe-applications/mine')
      .set('Authorization', `Bearer ${bearer(user)}`);
    expect(withdraw.status).toBe(200);
    expect(withdraw.body.data.status).toBe('withdrawn');

    const again = await submit(user);
    expect(again.status).toBe(201);
  });

  test('returns 404 when there is no pending application to withdraw', async () => {
    const user = await makeUser();
    const res = await request(app)
      .delete('/api/v1/cafe-applications/mine')
      .set('Authorization', `Bearer ${bearer(user)}`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/cafeApplicationSubmit.test.js --runInBand`
Expected: FAIL — 404 on every route.

- [ ] **Step 3: Add the rate limiter**

In `backend/src/middleware/rateLimiter.js`, alongside the existing limiters:

```js
// Its own bucket rather than sharing contactFormRateLimiter's: submitting an
// application emails the operator, so someone hammering one form must not be
// able to exhaust the other's quota.
const cafeApplicationRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many cafe applications from this IP, please try again later.',
});
```

Add `cafeApplicationRateLimiter` to `module.exports`.

- [ ] **Step 4: Extend `backend/src/services/cafeApplicationService.js`**

Add above the existing exports:

```js
const Cafe = require('../models/Cafe');
const { generateApplicationRef } = require('../utils/applicationRef');
const { logAuditEvent } = require('./auditService');
const {
  requiredName,
  normalizeSlug,
  validateTimezone,
  validateAddress,
} = require('../utils/cafeInput');
const { BadRequestError, ForbiddenError, ConflictError, NotFoundError } = require('../utils/errors');

const REF_ATTEMPTS = 5;

const validateApplicationInput = (body) => {
  if (!body || typeof body !== 'object') {
    throw new BadRequestError('Application payload is required');
  }
  return {
    organization_name: requiredName(body.organization_name, 'organization_name'),
    cafe_name: requiredName(body.cafe_name, 'cafe_name'),
    cafe_slug: normalizeSlug(body.cafe_slug),
    timezone: validateTimezone(body.timezone),
    address: validateAddress(body.address),
  };
};

// Advisory only. The authoritative check happens inside provisionCafe's
// transaction at approval time, so a race surfaces to the reviewer as a
// clear conflict rather than to the applicant as a silent failure.
const assertSlugAvailable = async (slug) => {
  const [takenByCafe, takenByApplication] = await Promise.all([
    Cafe.exists({ slug }),
    CafeApplication.exists({ cafe_slug: slug, status: 'pending' }),
  ]);
  if (takenByCafe || takenByApplication) {
    throw new BadRequestError('That cafe address is already taken. Please choose another.');
  }
};

const createApplication = async ({ user, body }) => {
  if (!user.is_email_verified) {
    throw new ForbiddenError('Please verify your email address before applying to list a cafe');
  }

  const data = validateApplicationInput(body);
  await assertSlugAvailable(data.cafe_slug);

  let application = null;
  for (let attempt = 0; attempt < REF_ATTEMPTS && !application; attempt += 1) {
    try {
      application = await CafeApplication.create({
        ...data,
        application_ref: generateApplicationRef(),
        applicant_user_id: user._id,
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      // The partial unique index on applicant_user_id fires when the caller
      // already has a pending application; anything else is a reference
      // collision worth one more try.
      if (error?.keyPattern?.applicant_user_id) {
        throw new ConflictError('You already have a cafe application awaiting review');
      }
      if (attempt === REF_ATTEMPTS - 1) throw error;
    }
  }

  await logAuditEvent({
    cafeId: null,
    entityType: 'CafeApplication',
    entityId: application._id,
    action: 'CAFE_APPLICATION_SUBMITTED',
    performedByUserId: user._id,
    afterState: { application_ref: application.application_ref, cafe_slug: application.cafe_slug },
  });

  return summarize(application);
};

const withdrawApplication = async (userId) => {
  const application = await CafeApplication.findOne({ applicant_user_id: userId, status: 'pending' });
  if (!application) {
    throw new NotFoundError('No pending cafe application to withdraw');
  }
  application.status = 'withdrawn';
  await application.save();

  await logAuditEvent({
    cafeId: null,
    entityType: 'CafeApplication',
    entityId: application._id,
    action: 'CAFE_APPLICATION_WITHDRAWN',
    performedByUserId: userId,
    afterState: { application_ref: application.application_ref },
  });

  return summarize(application);
};
```

Extend `module.exports` to `{ getLatestApplicationSummary, summarize, createApplication, withdrawApplication, validateApplicationInput }`.

- [ ] **Step 5: Write `backend/src/controllers/cafeApplicationController.js`**

```js
const {
  createApplication,
  withdrawApplication,
  getLatestApplicationSummary,
} = require('../services/cafeApplicationService');

const postCafeApplication = async (req, res, next) => {
  try {
    const application = await createApplication({ user: req.user, body: req.body });
    res.status(201).json({ status: 'success', data: application });
  } catch (error) {
    next(error);
  }
};

const getMyCafeApplication = async (req, res, next) => {
  try {
    const application = await getLatestApplicationSummary(req.user._id);
    res.status(200).json({ status: 'success', data: application });
  } catch (error) {
    next(error);
  }
};

const deleteMyCafeApplication = async (req, res, next) => {
  try {
    const application = await withdrawApplication(req.user._id);
    res.status(200).json({ status: 'success', data: application });
  } catch (error) {
    next(error);
  }
};

module.exports = { postCafeApplication, getMyCafeApplication, deleteMyCafeApplication };
```

- [ ] **Step 6: Write `backend/src/routes/v1/cafeApplicationRoutes.js` and mount it**

```js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { cafeApplicationRateLimiter } = require('../../middleware/rateLimiter');
const {
  postCafeApplication,
  getMyCafeApplication,
  deleteMyCafeApplication,
} = require('../../controllers/cafeApplicationController');

router.use(authenticate);

router.post('/', cafeApplicationRateLimiter, postCafeApplication);
router.get('/mine', getMyCafeApplication);
router.delete('/mine', deleteMyCafeApplication);

module.exports = router;
```

In `backend/src/routes/index.js`, add the require and mount it beside the others:

```js
const cafeApplicationRoutes = require('./v1/cafeApplicationRoutes');
...
router.use('/v1/cafe-applications', cafeApplicationRoutes);
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && npx jest tests/integration/cafeApplicationSubmit.test.js --runInBand`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/middleware/rateLimiter.js backend/src/services/cafeApplicationService.js backend/src/controllers/cafeApplicationController.js backend/src/routes/ backend/tests/integration/cafeApplicationSubmit.test.js
git commit -m "feat: add applicant-facing cafe application endpoints"
```

---

### Task 6: Application emails

**Files:**
- Modify: `backend/src/config/env.js`
- Modify: `backend/src/services/emailService.js`
- Test: `backend/tests/unit/cafeApplicationEmail.test.js`

**Interfaces:**
- Consumes: `config.ADMIN_EMAIL`, `config.CONTACT_EMAIL`, `config.FROM_EMAIL`, `config.FRONTEND_URL`, and the existing `escapeHtml`.
- Produces three functions exported from `emailService.js`:
  - `sendCafeApplicationReviewEmail({ application, applicant })`
  - `sendCafeApplicationApprovedEmail({ to, applicationRef, cafeName, cafeSlug })`
  - `sendCafeApplicationRejectedEmail({ to, applicationRef, cafeName, note })`

  Each returns `{ logged, data, error }`, matching every existing sender.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/cafeApplicationEmail.test.js`. Read `backend/tests/unit/emailService.test.js` first and follow its mocking idiom exactly; the structure below assumes Resend is mocked at the module boundary.

```js
const mockSend = jest.fn().mockResolvedValue({ data: { id: 'email_1' }, error: null });

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

jest.mock('../../src/config/env', () => ({
  RESEND_API_KEY: 'test_key',
  FROM_EMAIL: 'nextBooq <hello@nextbooq.in>',
  ADMIN_EMAIL: 'ops@nextbooq.in',
  CONTACT_EMAIL: 'contact@nextbooq.in',
  FRONTEND_URL: 'https://nextbooq.in',
}));

const {
  sendCafeApplicationReviewEmail,
  sendCafeApplicationApprovedEmail,
  sendCafeApplicationRejectedEmail,
} = require('../../src/services/emailService');

const application = (overrides = {}) => ({
  id: 'app_1',
  application_ref: 'NB-7K2M-9QRT',
  organization_name: 'Filter Kaapi Co',
  cafe_name: 'Filter Kaapi',
  cafe_slug: 'filter-kaapi',
  timezone: 'Asia/Kolkata',
  address: {
    line1: '12 Church Street',
    line2: '',
    landmark: '',
    city: 'Bengaluru',
    state: 'Karnataka',
    postal_code: '560001',
    country: 'India',
    map_url: 'https://maps.google.com/?q=filter+kaapi',
  },
  created_at: new Date('2026-08-29T10:00:00Z'),
  ...overrides,
});

const applicant = (overrides = {}) => ({
  name: 'Asha Menon',
  email: 'asha@example.com',
  phone: '+91 98765 43210',
  ...overrides,
});

describe('sendCafeApplicationReviewEmail', () => {
  beforeEach(() => mockSend.mockClear());

  test('sends to ADMIN_EMAIL with the reference in the subject', async () => {
    await sendCafeApplicationReviewEmail({ application: application(), applicant: applicant() });

    const [call] = mockSend.mock.calls;
    expect(call[0].to).toBe('ops@nextbooq.in');
    expect(call[0].subject).toContain('NB-7K2M-9QRT');
    expect(call[0].subject).toContain('Filter Kaapi');
  });

  test('sets reply-to to the applicant so the reviewer can just reply', async () => {
    await sendCafeApplicationReviewEmail({ application: application(), applicant: applicant() });
    expect(mockSend.mock.calls[0][0].replyTo).toBe('asha@example.com');
  });

  test('includes the address, slug and a deep link to the review screen', async () => {
    await sendCafeApplicationReviewEmail({ application: application(), applicant: applicant() });
    const { html } = mockSend.mock.calls[0][0];

    expect(html).toContain('12 Church Street');
    expect(html).toContain('Bengaluru');
    expect(html).toContain('560001');
    expect(html).toContain('filter-kaapi');
    expect(html).toContain('https://nextbooq.in/admin/cafe-applications/app_1');
  });

  test('escapes applicant-supplied HTML', async () => {
    await sendCafeApplicationReviewEmail({
      application: application({ cafe_name: '<script>alert(1)</script>' }),
      applicant: applicant(),
    });
    const { html } = mockSend.mock.calls[0][0];

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('strips newlines from the subject to block header injection', async () => {
    await sendCafeApplicationReviewEmail({
      application: application({ cafe_name: 'Evil\nBcc: victim@example.com' }),
      applicant: applicant(),
    });
    expect(mockSend.mock.calls[0][0].subject).not.toMatch(/[\r\n]/);
  });
});

describe('applicant decision emails', () => {
  beforeEach(() => mockSend.mockClear());

  test('the approval email links to the new dashboard', async () => {
    await sendCafeApplicationApprovedEmail({
      to: 'asha@example.com', applicationRef: 'NB-7K2M-9QRT', cafeName: 'Filter Kaapi', cafeSlug: 'filter-kaapi',
    });
    const { to, html } = mockSend.mock.calls[0][0];
    expect(to).toBe('asha@example.com');
    expect(html).toContain('https://nextbooq.in/filter-kaapi/dashboard');
  });

  test('the rejection email carries the reviewer note, escaped', async () => {
    await sendCafeApplicationRejectedEmail({
      to: 'asha@example.com', applicationRef: 'NB-7K2M-9QRT', cafeName: 'Filter Kaapi',
      note: 'Could not verify <b>the address</b>',
    });
    const { html } = mockSend.mock.calls[0][0];
    expect(html).toContain('NB-7K2M-9QRT');
    expect(html).toContain('&lt;b&gt;the address&lt;/b&gt;');
    expect(html).not.toContain('<b>the address</b>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/unit/cafeApplicationEmail.test.js --runInBand`
Expected: FAIL — the three functions are not exported.

- [ ] **Step 3: Add `ADMIN_EMAIL` to `backend/src/config/env.js`**

Add beside `CONTACT_EMAIL` in the schema:

```js
    // Recipient for operator notifications (currently: a cafe application
    // needing review). Falls back to CONTACT_EMAIL and then FROM_EMAIL, so
    // this works with no config change.
    ADMIN_EMAIL: z.string().optional(),
```

- [ ] **Step 4: Add the three senders to `backend/src/services/emailService.js`**

```js
const applicationReviewRecipient = () => config.ADMIN_EMAIL || config.CONTACT_EMAIL || config.FROM_EMAIL;

const formatAddressHtml = (address = {}) =>
  [address.line1, address.line2, address.landmark, address.city, address.state, address.postal_code, address.country]
    .filter((part) => typeof part === 'string' && part.trim())
    .map((part) => escapeHtml(part))
    .join(', ');

const sendCafeApplicationReviewEmail = async ({ application, applicant }) => {
  const recipient = applicationReviewRecipient();
  const reviewUrl = `${config.FRONTEND_URL}/admin/cafe-applications/${application.id}`;

  if (!config.RESEND_API_KEY) {
    console.log(
      `[emailService] RESEND_API_KEY not set — logging cafe application instead of sending. ref=${application.application_ref} to=${recipient} review=${reviewUrl}`
    );
    return { logged: true, data: null, error: null };
  }

  const resend = new Resend(config.RESEND_API_KEY);

  try {
    // Same rationale as sendContactEmail: everything below is applicant-
    // supplied, so it is escaped for the body and newline-stripped for the
    // subject (header injection).
    const safeCafeNameForSubject = String(application.cafe_name).replace(/[\r\n]+/g, ' ');
    const mapLink = application.address?.map_url
      ? `<p><strong>Map:</strong> <a href="${escapeHtml(application.address.map_url)}">${escapeHtml(application.address.map_url)}</a></p>`
      : '';

    const { data, error } = await resend.emails.send({
      from: config.FROM_EMAIL,
      to: recipient,
      replyTo: applicant.email,
      subject: `New cafe application ${application.application_ref} — ${safeCafeNameForSubject}`,
      html: `
        <p>A cafe owner has applied to list a cafe on nextBooq.</p>
        <p><strong>Reference:</strong> ${escapeHtml(application.application_ref)}</p>
        <p><strong>Applicant:</strong> ${escapeHtml(applicant.name)} (${escapeHtml(applicant.email)}, ${escapeHtml(applicant.phone || '')})</p>
        <p><strong>Organization:</strong> ${escapeHtml(application.organization_name)}</p>
        <p><strong>Cafe:</strong> ${escapeHtml(application.cafe_name)}</p>
        <p><strong>Requested address:</strong> /${escapeHtml(application.cafe_slug)}</p>
        <p><strong>Timezone:</strong> ${escapeHtml(application.timezone)}</p>
        <p><strong>Address:</strong> ${formatAddressHtml(application.address)}</p>
        ${mapLink}
        <p><strong>Submitted:</strong> ${escapeHtml(new Date(application.created_at).toISOString())}</p>
        <p><a href="${reviewUrl}">Review this application</a></p>
      `,
    });

    if (error) {
      console.error('[emailService] Failed to send cafe application review email:', error);
    }

    return { logged: false, data, error };
  } catch (err) {
    console.error('[emailService] Failed to send cafe application review email:', err);
    return { logged: false, data: null, error: { message: err.message } };
  }
};

const sendCafeApplicationApprovedEmail = async ({ to, applicationRef, cafeName, cafeSlug }) => {
  if (!config.RESEND_API_KEY) {
    console.log(`[emailService] RESEND_API_KEY not set — logging approval instead of sending. to=${to} ref=${applicationRef}`);
    return { logged: true, data: null, error: null };
  }

  const resend = new Resend(config.RESEND_API_KEY);

  try {
    const { data, error } = await resend.emails.send({
      from: config.FROM_EMAIL,
      to,
      subject: `Your cafe is live on nextBooq — ${applicationRef}`,
      html: `
        <p>Good news — ${escapeHtml(cafeName)} has been approved and is now live on nextBooq.</p>
        <p>Set your operating hours, tables and payment details before taking bookings:</p>
        <p><a href="${config.FRONTEND_URL}/${escapeHtml(cafeSlug)}/dashboard">Open your dashboard</a></p>
        <p>Application reference: ${escapeHtml(applicationRef)}</p>
      `,
    });

    if (error) {
      console.error('[emailService] Failed to send cafe application approval email:', error);
    }

    return { logged: false, data, error };
  } catch (err) {
    console.error('[emailService] Failed to send cafe application approval email:', err);
    return { logged: false, data: null, error: { message: err.message } };
  }
};

const sendCafeApplicationRejectedEmail = async ({ to, applicationRef, cafeName, note }) => {
  if (!config.RESEND_API_KEY) {
    console.log(`[emailService] RESEND_API_KEY not set — logging rejection instead of sending. to=${to} ref=${applicationRef}`);
    return { logged: true, data: null, error: null };
  }

  const resend = new Resend(config.RESEND_API_KEY);

  try {
    const { data, error } = await resend.emails.send({
      from: config.FROM_EMAIL,
      to,
      subject: `About your nextBooq cafe application — ${applicationRef}`,
      html: `
        <p>We were not able to approve the application for ${escapeHtml(cafeName)} as submitted.</p>
        <p><strong>What we need:</strong> ${escapeHtml(note || 'Please get in touch so we can verify your cafe.')}</p>
        <p>You can update the details and apply again from your profile:</p>
        <p><a href="${config.FRONTEND_URL}/profile">Go to your profile</a></p>
        <p>Application reference: ${escapeHtml(applicationRef)}</p>
      `,
    });

    if (error) {
      console.error('[emailService] Failed to send cafe application rejection email:', error);
    }

    return { logged: false, data, error };
  } catch (err) {
    console.error('[emailService] Failed to send cafe application rejection email:', err);
    return { logged: false, data: null, error: { message: err.message } };
  }
};
```

Add all three to `module.exports`.

- [ ] **Step 5: Trigger the review email on submit**

In `backend/src/services/cafeApplicationService.js`, import the sender and fire it (fire-and-forget) at the end of `createApplication`, just before the return:

```js
const { sendCafeApplicationReviewEmail } = require('./emailService');
...
  const summary = summarize(application);
  // Fire-and-forget — same rationale as registerUser: a Resend outage must
  // never fail an application that was otherwise written successfully.
  sendCafeApplicationReviewEmail({
    application: { ...summary, organization_name: application.organization_name, timezone: application.timezone, address: application.address.toObject() },
    applicant: { name: user.name, email: user.email, phone: user.phone },
  }).catch((err) => {
    console.error('[cafeApplicationService] Failed to send review email:', err);
  });

  return summary;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && npx jest tests/unit/cafeApplicationEmail.test.js tests/unit/emailService.test.js tests/unit/env.test.js tests/integration/cafeApplicationSubmit.test.js --runInBand`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/config/env.js backend/src/services/emailService.js backend/src/services/cafeApplicationService.js backend/tests/unit/cafeApplicationEmail.test.js
git commit -m "feat: email the operator when a cafe application needs review"
```

---

### Task 7: Admin review, approval and rejection

**Files:**
- Modify: `backend/src/services/cafeApplicationService.js`
- Modify: `backend/src/controllers/platformAdmin/platformAdminController.js`
- Modify: `backend/src/routes/v1/platformAdminRoutes.js`
- Test: `backend/tests/integration/cafeApplicationReview.test.js`

**Interfaces:**
- Consumes: `provisionCafe` (Task 2), the decision emails (Task 6), `summarize` (Task 4).
- Produces:
  - `listApplications({ status })` → array of summaries with the applicant attached.
  - `getApplicationDetail(id)` → the full application plus applicant.
  - `approveApplication({ applicationId, adminUserId, subscription })` → `{ application, provisioned }`.
  - `rejectApplication({ applicationId, adminUserId, note })` → the summary.
  - `GET/POST` routes under `/api/v1/platform-admin/cafe-applications`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/cafeApplicationReview.test.js`:

```js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const User = require('../../src/models/User');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const Subscription = require('../../src/models/Subscription');
const CafeApplication = require('../../src/models/CafeApplication');
const { setupTestDB } = require('../setup');

setupTestDB();

let userSeq = 0;
const makeUser = (overrides = {}) => {
  userSeq += 1;
  return User.create({
    name: 'Applicant',
    email: `review-${userSeq}@example.com`,
    phone: `+1555016${String(1000 + userSeq)}`,
    password_hash: 'x',
    is_email_verified: true,
    ...overrides,
  });
};

const bearer = (user) => jwt.sign({ id: user._id.toString(), tv: user.token_version }, config.JWT_SECRET);

const makeApplication = (user, overrides = {}) =>
  CafeApplication.create({
    application_ref: `NB-TEST-${String(1000 + userSeq)}`,
    applicant_user_id: user._id,
    organization_name: 'Filter Kaapi Co',
    cafe_name: 'Filter Kaapi',
    cafe_slug: `filter-kaapi-${userSeq}`,
    timezone: 'Asia/Kolkata',
    address: { line1: '12 Church Street', city: 'Bengaluru', state: 'Karnataka', postal_code: '560001' },
    ...overrides,
  });

const trialSubscription = { status: 'trial', term_months: 1, price_per_month: 0 };

describe('platform-admin cafe application review', () => {
  test('rejects a non-admin from listing, approving and rejecting', async () => {
    const applicant = await makeUser();
    const application = await makeApplication(applicant);

    const [list, approve, reject] = await Promise.all([
      request(app).get('/api/v1/platform-admin/cafe-applications').set('Authorization', `Bearer ${bearer(applicant)}`),
      request(app).post(`/api/v1/platform-admin/cafe-applications/${application._id}/approve`).set('Authorization', `Bearer ${bearer(applicant)}`).send({ subscription: trialSubscription }),
      request(app).post(`/api/v1/platform-admin/cafe-applications/${application._id}/reject`).set('Authorization', `Bearer ${bearer(applicant)}`).send({ note: 'no' }),
    ]);

    expect([list.status, approve.status, reject.status]).toEqual([403, 403, 403]);
    expect(await Cafe.countDocuments()).toBe(0);
  });

  test('approving provisions the org, cafe, subscription and owner membership', async () => {
    const admin = await makeUser({ is_platform_admin: true });
    const applicant = await makeUser();
    const application = await makeApplication(applicant);

    const res = await request(app)
      .post(`/api/v1/platform-admin/cafe-applications/${application._id}/approve`)
      .set('Authorization', `Bearer ${bearer(admin)}`)
      .send({ subscription: trialSubscription });

    expect(res.status).toBe(200);

    const cafe = await Cafe.findOne({ slug: application.cafe_slug });
    expect(cafe).not.toBeNull();
    expect(cafe.address.line1).toBe('12 Church Street');
    expect(await Organization.countDocuments()).toBe(1);
    expect(await Subscription.countDocuments({ cafe_id: cafe._id, is_current: true })).toBe(1);

    const owner = await User.findById(applicant._id);
    expect(owner.staff_memberships).toHaveLength(1);
    expect(owner.staff_memberships[0].role).toBe('owner');

    const stored = await CafeApplication.findById(application._id);
    expect(stored.status).toBe('approved');
    expect(stored.provisioned_cafe_id.toString()).toBe(cafe._id.toString());
    expect(stored.reviewed_by_user_id.toString()).toBe(admin._id.toString());
    expect(stored.reviewed_at).not.toBeNull();
  });

  test('a slug taken between submit and approve leaves the application pending and writes nothing', async () => {
    const admin = await makeUser({ is_platform_admin: true });
    const applicant = await makeUser();
    const application = await makeApplication(applicant);

    const squatterOrg = await Organization.create({ name: 'Squatter Organization' });
    await Cafe.create({
      org_id: squatterOrg._id, name: 'Squatter', slug: application.cafe_slug, timezone: 'UTC',
    });

    const res = await request(app)
      .post(`/api/v1/platform-admin/cafe-applications/${application._id}/approve`)
      .set('Authorization', `Bearer ${bearer(admin)}`)
      .send({ subscription: trialSubscription });

    expect(res.status).toBe(409);

    const stored = await CafeApplication.findById(application._id);
    expect(stored.status).toBe('pending');
    expect(stored.provisioned_cafe_id).toBeNull();
    // Only the squatter's org exists — no half-applied provisioning.
    expect(await Organization.countDocuments()).toBe(1);
    expect(await Subscription.countDocuments()).toBe(0);
  });

  test('approving an already-approved application is refused', async () => {
    const admin = await makeUser({ is_platform_admin: true });
    const applicant = await makeUser();
    const application = await makeApplication(applicant);

    await request(app)
      .post(`/api/v1/platform-admin/cafe-applications/${application._id}/approve`)
      .set('Authorization', `Bearer ${bearer(admin)}`)
      .send({ subscription: trialSubscription });

    const second = await request(app)
      .post(`/api/v1/platform-admin/cafe-applications/${application._id}/approve`)
      .set('Authorization', `Bearer ${bearer(admin)}`)
      .send({ subscription: trialSubscription });

    expect(second.status).toBe(409);
    expect(await Cafe.countDocuments()).toBe(1);
  });

  test('rejecting records the note and permits a fresh application', async () => {
    const admin = await makeUser({ is_platform_admin: true });
    const applicant = await makeUser();
    const application = await makeApplication(applicant);

    const res = await request(app)
      .post(`/api/v1/platform-admin/cafe-applications/${application._id}/reject`)
      .set('Authorization', `Bearer ${bearer(admin)}`)
      .send({ note: 'Could not verify the address' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('rejected');
    expect(res.body.data.review_note).toBe('Could not verify the address');
    expect(await Cafe.countDocuments()).toBe(0);

    const fresh = await request(app)
      .post('/api/v1/cafe-applications')
      .set('Authorization', `Bearer ${bearer(applicant)}`)
      .send({
        organization_name: 'Filter Kaapi Co',
        cafe_name: 'Filter Kaapi',
        cafe_slug: 'filter-kaapi-retry',
        timezone: 'Asia/Kolkata',
        address: { line1: '12 Church Street', city: 'Bengaluru', state: 'Karnataka', postal_code: '560001' },
      });
    expect(fresh.status).toBe(201);
  });

  test('rejecting without a note is refused', async () => {
    const admin = await makeUser({ is_platform_admin: true });
    const applicant = await makeUser();
    const application = await makeApplication(applicant);

    const res = await request(app)
      .post(`/api/v1/platform-admin/cafe-applications/${application._id}/reject`)
      .set('Authorization', `Bearer ${bearer(admin)}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('lists pending applications newest first with the applicant attached', async () => {
    const admin = await makeUser({ is_platform_admin: true });
    const first = await makeUser();
    await makeApplication(first);
    const second = await makeUser();
    await makeApplication(second);

    const res = await request(app)
      .get('/api/v1/platform-admin/cafe-applications?status=pending')
      .set('Authorization', `Bearer ${bearer(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].applicant.email).toBe(second.email);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/cafeApplicationReview.test.js --runInBand`
Expected: FAIL — 404 on the review routes.

- [ ] **Step 3: Add the review functions to `cafeApplicationService.js`**

```js
const User = require('../models/User');
const { provisionCafe } = require('./cafeProvisioningService');
const {
  sendCafeApplicationApprovedEmail,
  sendCafeApplicationRejectedEmail,
} = require('./emailService');

const withApplicant = (application, applicant) => ({
  ...summarize(application),
  organization_name: application.organization_name,
  timezone: application.timezone,
  address: application.address?.toObject ? application.address.toObject() : application.address,
  reviewed_at: application.reviewed_at,
  applicant: applicant
    ? { id: applicant._id.toString(), name: applicant.name, email: applicant.email, phone: applicant.phone }
    : null,
});

const listApplications = async ({ status } = {}) => {
  const filter = status ? { status } : {};
  const applications = await CafeApplication.find(filter)
    .sort({ created_at: -1 })
    .populate('applicant_user_id', 'name email phone');
  return applications.map((application) => withApplicant(application, application.applicant_user_id));
};

const getApplicationDetail = async (applicationId) => {
  const application = await CafeApplication.findById(applicationId).populate(
    'applicant_user_id',
    'name email phone'
  );
  if (!application) throw new NotFoundError('Cafe application not found');
  return withApplicant(application, application.applicant_user_id);
};

const loadPending = async (applicationId) => {
  const application = await CafeApplication.findById(applicationId);
  if (!application) throw new NotFoundError('Cafe application not found');
  if (application.status !== 'pending') {
    throw new ConflictError(`This application has already been ${application.status}`);
  }
  return application;
};

/**
 * The only path from an application into live tenancy. provisionCafe runs
 * first and is the sole writer of Organization/Cafe/Subscription/membership;
 * the application is only marked approved once that transaction has
 * committed, so a slug conflict leaves the application pending and nothing
 * half-applied.
 */
const approveApplication = async ({ applicationId, adminUserId, subscription }) => {
  const application = await loadPending(applicationId);
  const applicant = await User.findById(application.applicant_user_id);
  if (!applicant) throw new NotFoundError('Applicant user not found');

  const provisioned = await provisionCafe({
    owner_user_id: application.applicant_user_id.toString(),
    adminUserId: adminUserId.toString(),
    organization: { mode: 'new', name: application.organization_name },
    cafe: {
      name: application.cafe_name,
      slug: application.cafe_slug,
      timezone: application.timezone,
      address: application.address.toObject(),
    },
    subscription,
  });

  application.status = 'approved';
  application.reviewed_by_user_id = adminUserId;
  application.reviewed_at = new Date();
  application.provisioned_cafe_id = provisioned.cafe.id;
  await application.save();

  await logAuditEvent({
    cafeId: provisioned.cafe.id,
    entityType: 'CafeApplication',
    entityId: application._id,
    action: 'CAFE_APPLICATION_APPROVED',
    performedByUserId: adminUserId,
    afterState: { application_ref: application.application_ref, cafe_id: provisioned.cafe.id },
  });

  sendCafeApplicationApprovedEmail({
    to: applicant.email,
    applicationRef: application.application_ref,
    cafeName: application.cafe_name,
    cafeSlug: application.cafe_slug,
  }).catch((err) => console.error('[cafeApplicationService] Failed to send approval email:', err));

  return { application: summarize(application), provisioned };
};

const rejectApplication = async ({ applicationId, adminUserId, note }) => {
  if (typeof note !== 'string' || !note.trim()) {
    throw new BadRequestError('A rejection note is required so the applicant knows what to fix');
  }

  const application = await loadPending(applicationId);
  const applicant = await User.findById(application.applicant_user_id);

  application.status = 'rejected';
  application.review_note = note.trim();
  application.reviewed_by_user_id = adminUserId;
  application.reviewed_at = new Date();
  await application.save();

  await logAuditEvent({
    cafeId: null,
    entityType: 'CafeApplication',
    entityId: application._id,
    action: 'CAFE_APPLICATION_REJECTED',
    performedByUserId: adminUserId,
    afterState: { application_ref: application.application_ref, review_note: application.review_note },
  });

  if (applicant) {
    sendCafeApplicationRejectedEmail({
      to: applicant.email,
      applicationRef: application.application_ref,
      cafeName: application.cafe_name,
      note: application.review_note,
    }).catch((err) => console.error('[cafeApplicationService] Failed to send rejection email:', err));
  }

  return summarize(application);
};
```

Add `listApplications`, `getApplicationDetail`, `approveApplication`, and `rejectApplication` to `module.exports`.

- [ ] **Step 4: Add the controllers**

In `backend/src/controllers/platformAdmin/platformAdminController.js`, import the four service functions and add:

```js
const getCafeApplications = async (req, res, next) => {
  try {
    const applications = await listApplications({ status: req.query.status });
    res.status(200).json({ status: 'success', data: applications });
  } catch (error) {
    next(error);
  }
};

const getCafeApplication = async (req, res, next) => {
  try {
    const application = await getApplicationDetail(req.params.id);
    res.status(200).json({ status: 'success', data: application });
  } catch (error) {
    next(error);
  }
};

const postApproveCafeApplication = async (req, res, next) => {
  try {
    const result = await approveApplication({
      applicationId: req.params.id,
      adminUserId: req.user._id,
      subscription: req.body.subscription,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};

const postRejectCafeApplication = async (req, res, next) => {
  try {
    const application = await rejectApplication({
      applicationId: req.params.id,
      adminUserId: req.user._id,
      note: req.body.note,
    });
    res.status(200).json({ status: 'success', data: application });
  } catch (error) {
    next(error);
  }
};
```

Add all four to that file's `module.exports`.

- [ ] **Step 5: Register the routes**

In `backend/src/routes/v1/platformAdminRoutes.js`, add the four handlers to the destructured import and register them beneath the existing routes:

```js
router.get('/cafe-applications', getCafeApplications);
router.get('/cafe-applications/:id', getCafeApplication);
router.post('/cafe-applications/:id/approve', postApproveCafeApplication);
router.post('/cafe-applications/:id/reject', postRejectCafeApplication);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && npx jest tests/integration/cafeApplicationReview.test.js tests/integration/platformAdminRoutes.test.js --runInBand`
Expected: PASS.

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && npx jest --runInBand`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/cafeApplicationService.js backend/src/controllers/platformAdmin/platformAdminController.js backend/src/routes/v1/platformAdminRoutes.js backend/tests/integration/cafeApplicationReview.test.js
git commit -m "feat: platform-admin review, approval and rejection of cafe applications"
```

---

### Task 8: Cafe settings can edit the address

**Files:**
- Modify: `backend/src/controllers/admin/cafeController.js`
- Modify: `frontend/src/lib/types/models.d.ts`
- Modify: `frontend/src/app/[tenant]/(dashboard)/settings/page.tsx`
- Test: `backend/tests/integration/cafeAddressSettings.test.js`
- Test: `frontend/src/app/[tenant]/(dashboard)/settings/page.test.tsx` (extend)

**Interfaces:**
- Consumes: `validateAddress` from Task 1; `Cafe.address` from Task 2.
- Produces: `PATCH` on the existing cafe-settings endpoint accepts an `address` object; the frontend `Cafe` type gains `address?: CafeAddress`, and `CafeAddress` is exported from `models.d.ts`.

- [ ] **Step 1: Write the failing backend test**

Create `backend/tests/integration/cafeAddressSettings.test.js`. Open `backend/tests/integration/cafeStorefrontSettings.test.js` first and copy its setup helpers (how it creates an org, a cafe, a manager with `edit_settings`, and how it addresses the settings endpoint) — reuse them rather than inventing a different shape.

```js
// Follow cafeStorefrontSettings.test.js for setup: setupTestDB(), an org, a
// cafe, a manager user holding edit_settings, and `settingsUrl(cafe)`.

describe('cafe address settings', () => {
  test('saves a valid address', async () => {
    // PATCH with:
    //   address: { line1: '12 Church Street', city: 'Bengaluru',
    //              state: 'Karnataka', postal_code: '560001',
    //              map_url: 'https://maps.google.com/?q=x' }
    // Expect 200, and the reloaded Cafe to carry every field, with
    // address.country defaulting to 'India'.
  });

  test('rejects a PIN with a leading zero and leaves the stored address untouched', async () => {
    // PATCH postal_code '060001' → 400 matching /6-digit/, and the cafe's
    // previously saved address is unchanged.
  });

  test('rejects a non-https map_url', async () => {
    // PATCH map_url 'http://maps.google.com' → 400 matching /https/.
    // PATCH map_url 'javascript:alert(1)'    → 400 matching /https/.
  });

  test('a request that omits address leaves the existing address alone', async () => {
    // Save an address, then PATCH only { contact_phone } → the address survives.
  });

  test('a cafe with no address can still save its payment settings', async () => {
    // The Task 2 regression guard, at the HTTP layer.
  });
});
```

Fill each body in following the existing suite's idiom. Do not leave them as comments — the test must actually run.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/cafeAddressSettings.test.js --runInBand`
Expected: FAIL — the address is silently ignored.

- [ ] **Step 3: Accept `address` in `updateCafe`**

In `backend/src/controllers/admin/cafeController.js`, import the shared validator:

```js
const { validateAddress } = require('../../utils/cafeInput');
```

Add `address` to the destructured `req.body`, and add this block directly after the existing `contact_phone` block:

```js
    // Same shape the onboarding application captured — validated by the one
    // shared validator so settings and provisioning can't diverge. Omitting
    // the key leaves the stored address untouched.
    if (address !== undefined) {
      cafe.address = validateAddress(address);
    }
```

Delete the now-duplicated local `isValidHttpsUrl` definition in this file and import it from `../../utils/cafeInput` instead, so there is one implementation.

- [ ] **Step 4: Run the backend test to verify it passes**

Run: `cd backend && npx jest tests/integration/cafeAddressSettings.test.js tests/integration/cafeStorefrontSettings.test.js tests/integration/cafePaymentsSettings.test.js --runInBand`
Expected: PASS.

- [ ] **Step 5: Add the frontend type**

In `frontend/src/lib/types/models.d.ts`, above `interface Cafe`:

```ts
export interface CafeAddress {
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  postal_code: string;
  country?: string;
  map_url?: string;
}
```

And add to `interface Cafe`, after `contact_phone`:

```ts
  address?: CafeAddress;
```

- [ ] **Step 6: Add the settings UI**

In `frontend/src/app/[tenant]/(dashboard)/settings/page.tsx`, follow the existing `contactPhone` pattern exactly — one state hook per field, reset in the same effect that resets `contactPhone`, and included in the same save payload:

```tsx
const [addressLine1, setAddressLine1] = useState(cafe.address?.line1 || '');
const [addressLine2, setAddressLine2] = useState(cafe.address?.line2 || '');
const [addressLandmark, setAddressLandmark] = useState(cafe.address?.landmark || '');
const [addressCity, setAddressCity] = useState(cafe.address?.city || '');
const [addressState, setAddressState] = useState(cafe.address?.state || '');
const [addressPostalCode, setAddressPostalCode] = useState(cafe.address?.postal_code || '');
const [addressMapUrl, setAddressMapUrl] = useState(cafe.address?.map_url || '');
```

In the save payload, send the address only when line 1 is filled in, so a cafe that has never set one does not start failing validation on an unrelated save:

```tsx
...(addressLine1.trim()
  ? {
      address: {
        line1: addressLine1.trim(),
        line2: addressLine2.trim(),
        landmark: addressLandmark.trim(),
        city: addressCity.trim(),
        state: addressState.trim(),
        postal_code: addressPostalCode.trim(),
        map_url: addressMapUrl.trim(),
      },
    }
  : {}),
```

Render the fields in a new "Address" card matching the surrounding card markup, with the map URL labelled "Map link (optional)" and helper text: *"Shown on your storefront so guests can find you."*

- [ ] **Step 7: Extend the settings page test**

In `frontend/src/app/[tenant]/(dashboard)/settings/page.test.tsx`, add:

```tsx
test('saving includes the address when line 1 is filled in', async () => {
  // Fill line1/city/state/PIN, save, and assert the request body carries
  // address: { line1, city, state, postal_code, ... }.
});

test('saving omits address entirely when line 1 is blank', async () => {
  // Save without touching the address fields; assert 'address' is not a key
  // in the request body.
});
```

Fill both bodies following the existing `'saving includes description, hero_image_url, contact_phone, and menu in the request body'` test in that file.

- [ ] **Step 8: Run the frontend tests**

Run: `cd frontend && npx vitest run src/app/\[tenant\]/\(dashboard\)/settings/page.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/controllers/admin/cafeController.js backend/tests/integration/cafeAddressSettings.test.js frontend/src/lib/types/models.d.ts frontend/src/app/
git commit -m "feat: let a cafe edit its address and map link in settings"
```

---

### Task 9: Storefront address tile

**Files:**
- Modify: `frontend/src/components/booking/cafe-info-card.tsx`
- Test: `frontend/src/components/booking/cafe-info-card.test.tsx` (extend)

**Interfaces:**
- Consumes: `Cafe.address` from Task 8.
- Produces: an address tile in `CafeInfoCard`, rendered only when `address.line1` is non-blank.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/components/booking/cafe-info-card.test.tsx`:

```tsx
const address = {
  line1: '12 Church Street',
  line2: 'Ashok Nagar',
  city: 'Bengaluru',
  state: 'Karnataka',
  postal_code: '560001',
  country: 'India',
};

describe('CafeInfoCard address tile', () => {
  test('does not show an address tile when the cafe has no address', () => {
    mockCafe = baseCafe;
    render(<CafeInfoCard />);
    expect(screen.queryByText(/find us/i)).not.toBeInTheDocument();
  });

  test('does not show an address tile when line 1 is whitespace-only', () => {
    mockCafe = { ...baseCafe, address: { ...address, line1: '   ' } };
    render(<CafeInfoCard />);
    expect(screen.queryByText(/find us/i)).not.toBeInTheDocument();
  });

  test('shows the address as plain text when there is no map link', () => {
    mockCafe = { ...baseCafe, address };
    render(<CafeInfoCard />);
    expect(screen.getByText(/find us/i)).toBeInTheDocument();
    expect(screen.getByText(/12 Church Street/)).toBeInTheDocument();
    expect(screen.getByText(/560001/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /12 Church Street/ })).not.toBeInTheDocument();
  });

  test('links the address to the map url with a safe rel when one is set', () => {
    mockCafe = { ...baseCafe, address: { ...address, map_url: 'https://maps.google.com/?q=filter+kaapi' } };
    render(<CafeInfoCard />);

    const link = screen.getByRole('link', { name: /12 Church Street/ });
    expect(link).toHaveAttribute('href', 'https://maps.google.com/?q=filter+kaapi');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/booking/cafe-info-card.test.tsx`
Expected: FAIL — no "Find us" tile is rendered.

- [ ] **Step 3: Render the tile**

In `frontend/src/components/booking/cafe-info-card.tsx`, add below the existing `contactPhone` line (note `MapPin` is already imported):

```tsx
  const address = cafe.address;
  const hasAddress = Boolean(address?.line1?.trim());
  const addressLine = hasAddress
    ? [address?.line1, address?.line2, address?.landmark, address?.city, address?.state, address?.postal_code]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(', ')
    : '';
  const mapUrl = address?.map_url?.trim();
```

Replace the hard-coded grid class, which currently only knows about the phone tile, with one that counts the optional tiles:

```tsx
  const optionalTiles = (contactPhone ? 1 : 0) + (hasAddress ? 1 : 0);
  const gridClass =
    optionalTiles === 2
      ? 'md:grid-cols-2 lg:grid-cols-5'
      : optionalTiles === 1
        ? 'md:grid-cols-2 lg:grid-cols-4'
        : 'md:grid-cols-3';
```

and use `className={\`grid grid-cols-1 gap-4 ${gridClass}\`}`.

Add the tile after the contact tile:

```tsx
        {hasAddress && (
          <div className="glass p-5 rounded-3xl border border-brand-brown/10 shadow-brand-sm space-y-2">
            <div className="w-9 h-9 bg-brand-red/10 text-brand-red rounded-xl flex items-center justify-center">
              <MapPin className="w-5 h-5" />
            </div>
            <h4 className="font-bold font-display text-sm text-brand-brown">Find Us</h4>
            <p className="text-xs text-brand-mocha leading-relaxed">
              {mapUrl ? (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-brand-brown underline decoration-brand-red/40 underline-offset-2"
                >
                  {addressLine}
                </a>
              ) : (
                addressLine
              )}
            </p>
          </div>
        )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/booking/cafe-info-card.test.tsx`
Expected: PASS, including the four pre-existing contact-tile tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/booking/cafe-info-card.tsx frontend/src/components/booking/cafe-info-card.test.tsx
git commit -m "feat: show the cafe address on the storefront when set"
```

---

### Task 10: Frontend types, hooks and the onboarding role choice

**Files:**
- Modify: `frontend/src/lib/types/models.d.ts`
- Create: `frontend/src/lib/types/cafe-application.ts`
- Create: `frontend/src/hooks/auth/use-update-account-type.ts`
- Create: `frontend/src/hooks/onboarding/use-my-cafe-application.ts`
- Create: `frontend/src/hooks/onboarding/use-submit-cafe-application.ts`
- Create: `frontend/src/hooks/onboarding/use-withdraw-cafe-application.ts`
- Modify: `frontend/src/lib/route-guard.ts`
- Modify: `frontend/src/app/(control-plane)/auth/verify-email/page.tsx`
- Rewrite: `frontend/src/app/(control-plane)/onboarding/page.tsx`
- Test: `frontend/src/lib/route-guard.test.ts` (extend, or create if absent)
- Test: `frontend/src/app/(control-plane)/auth/verify-email/page.test.tsx` (extend)
- Test: `frontend/src/app/(control-plane)/onboarding/page.test.tsx`

**Interfaces:**
- Consumes: the Task 4 and Task 5 endpoints.
- Produces:
  - `CafeApplicationSummary` and `CafeApplicationPayload` in `frontend/src/lib/types/cafe-application.ts`.
  - `User.account_type: 'customer' | 'cafe_owner' | null` and `User.cafe_application: CafeApplicationSummary | null` in `models.d.ts`.
  - `useUpdateAccountType()`, `useMyCafeApplication(enabled)`, `useSubmitCafeApplication()`, `useWithdrawCafeApplication()`.
  - `isDashboardRoute`/`resolveRedirect` treat `/onboarding` as protected.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/(control-plane)/onboarding/page.test.tsx`:

```tsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import OnboardingPage from './page';

const push = vi.fn();
const mutate = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'u1', account_type: null, cafe_application: null, staff_memberships: [], owner_org_id: null, is_platform_admin: false, is_email_verified: true, email: 'a@b.com', name: 'A' } }),
}));

vi.mock('@/hooks/auth/use-update-account-type', () => ({
  useUpdateAccountType: () => ({ mutate, isPending: false }),
}));

describe('OnboardingPage', () => {
  beforeEach(() => { push.mockClear(); mutate.mockClear(); });

  test('offers both roles', () => {
    render(<OnboardingPage />);
    expect(screen.getByRole('button', { name: /booking a table/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run a cafe/i })).toBeInTheDocument();
  });

  test('choosing customer records the account type', async () => {
    render(<OnboardingPage />);
    await userEvent.click(screen.getByRole('button', { name: /booking a table/i }));
    expect(mutate).toHaveBeenCalledWith(
      { account_type: 'customer' },
      expect.anything()
    );
  });

  test('choosing cafe owner records the account type', async () => {
    render(<OnboardingPage />);
    await userEvent.click(screen.getByRole('button', { name: /run a cafe/i }));
    expect(mutate).toHaveBeenCalledWith(
      { account_type: 'cafe_owner' },
      expect.anything()
    );
  });
});
```

Extend `frontend/src/app/(control-plane)/auth/verify-email/page.test.tsx` with the surface-isolation pair — this is the most important test in the plan:

```tsx
test('a control-plane registration lands on the onboarding role choice', async () => {
  // searchParams: callbackUrl=/&source=register
  // After a successful verification, expect push to have been called with '/onboarding'.
});

test('a storefront verification never lands on the onboarding role choice', async () => {
  // searchParams: callbackUrl=/demo-cafe  (no source — this is what the
  // storefront quick-auth produces)
  // Expect push/replace to have been called with '/demo-cafe' and never
  // with anything starting '/onboarding'.
});
```

Fill both following that file's existing mocking of `useVerifyEmail` and `useSearchParams`.

Extend `frontend/src/lib/route-guard.test.ts` (create it if it does not exist, following the shape of the other `lib` tests):

```ts
test('protects the onboarding routes', () => {
  expect(resolveRedirect('/onboarding', null)).toEqual({
    redirectTo: '/auth/login',
    callbackUrl: '/onboarding',
  });
  expect(resolveRedirect('/onboarding/cafe', null)).not.toBeNull();
});

test('lets an authenticated user through to onboarding', () => {
  expect(resolveRedirect('/onboarding', VALID_SESSION_COOKIE_HEADER)).toBeNull();
});
```

Use whatever the existing tests in that file use for a valid session cookie header.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/app/\(control-plane\)/onboarding src/lib/route-guard.test.ts`
Expected: FAIL — the onboarding page still redirects, and `/onboarding` is unprotected.

- [ ] **Step 3: Add the types**

Create `frontend/src/lib/types/cafe-application.ts`:

```ts
import type { CafeAddress } from './models';

export type CafeApplicationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface CafeApplicationSummary {
  id: string;
  application_ref: string;
  status: CafeApplicationStatus;
  cafe_slug: string;
  cafe_name: string;
  created_at: string;
  review_note: string;
}

export interface CafeApplicationPayload {
  organization_name: string;
  cafe_name: string;
  cafe_slug: string;
  timezone: string;
  address: CafeAddress;
}
```

In `frontend/src/lib/types/models.d.ts`, add to `interface User`:

```ts
  account_type: 'customer' | 'cafe_owner' | null;
  cafe_application: import('./cafe-application').CafeApplicationSummary | null;
```

- [ ] **Step 4: Add the hooks**

`frontend/src/hooks/auth/use-update-account-type.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';

export interface UpdateAccountTypePayload {
  account_type: 'customer' | 'cafe_owner';
}

export const useUpdateAccountType = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateAccountTypePayload) => {
      const { data } = await axiosInstance.patch('/api/v1/auth/account-type', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
};
```

Check `frontend/src/hooks/auth/use-me.ts` for the exact `queryKey` it uses and match it — invalidating the wrong key silently leaves stale state.

`frontend/src/hooks/onboarding/use-my-cafe-application.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { ApiResponse } from '@/lib/types/api-responses';
import { CafeApplicationSummary } from '@/lib/types/cafe-application';

export const useMyCafeApplication = (enabled = true) =>
  useQuery({
    queryKey: ['cafe-application', 'mine'],
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<CafeApplicationSummary | null>>(
        '/api/v1/cafe-applications/mine'
      );
      return data.data || null;
    },
    enabled,
    staleTime: 30 * 1000,
    retry: false,
  });
```

`frontend/src/hooks/onboarding/use-submit-cafe-application.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { ApiResponse } from '@/lib/types/api-responses';
import { CafeApplicationPayload, CafeApplicationSummary } from '@/lib/types/cafe-application';

export const useSubmitCafeApplication = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CafeApplicationPayload) => {
      const { data } = await axiosInstance.post<ApiResponse<CafeApplicationSummary>>(
        '/api/v1/cafe-applications',
        payload
      );
      return data.data as CafeApplicationSummary;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cafe-application', 'mine'] });
    },
  });
};
```

`frontend/src/hooks/onboarding/use-withdraw-cafe-application.ts` mirrors it with `axiosInstance.delete('/api/v1/cafe-applications/mine')` and the same invalidation.

- [ ] **Step 5: Protect `/onboarding` in the route guard**

In `frontend/src/lib/route-guard.ts`:

```ts
const ONBOARDING_ROUTE_PATTERN = /^\/onboarding(\/|$)/;
```

and add `ONBOARDING_ROUTE_PATTERN.test(pathname) ||` to `isProtectedRoute`.

- [ ] **Step 6: Fork the verify-email success handler**

In `frontend/src/app/(control-plane)/auth/verify-email/page.tsx`, inside `handleSuccess`, change the `source === 'register'` branch so it routes to the role choice instead of straight to `callbackUrl`:

```tsx
    if (source === 'register') {
      // Only the control-plane register page sets source=register. The
      // storefront quick-auth never does, so its guests never see the
      // customer/cafe-owner prompt.
      router.push(`/onboarding?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    } else if (source === 'email-change') {
```

Leave the rest of the handler, and the `useEffect` that replaces to `callbackUrl` for an already-verified user, untouched.

- [ ] **Step 7: Rewrite the onboarding page**

Replace `frontend/src/app/(control-plane)/onboarding/page.tsx` with a client component offering two large choice buttons, styled to match the register page's card (`bg-brand-cream`, `glass rounded-3xl`, `cta-hero` for the primary action). Wrap `useSearchParams` in `<Suspense>`, as the register page does.

- Heading: "How will you use nextBooq?"
- Button 1, accessible name containing "booking a table": on click, `mutate({ account_type: 'customer' }, { onSuccess: () => router.push(callbackUrl || '/') })`.
- Button 2, accessible name containing "run a cafe": on click, `mutate({ account_type: 'cafe_owner' }, { onSuccess: () => router.push('/onboarding/cafe') })`.
- Beneath both, muted text: "You can change this later from your profile."
- `callbackUrl` comes from `useSearchParams().get('callbackUrl')`; fall back to `/`. Reject anything not starting with a single `/` — reuse `resolvePostAuthDestination`'s safety by only accepting a value matching `/^\/(?!\/)/`.

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/app/\(control-plane\) src/lib/route-guard.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib frontend/src/hooks frontend/src/app/\(control-plane\)
git commit -m "feat: ask control-plane signups whether they are a diner or a cafe owner"
```

---

### Task 11: The cafe application wizard and status screen

**Files:**
- Create: `frontend/src/components/onboarding/cafe-application-wizard.tsx`
- Create: `frontend/src/app/(control-plane)/onboarding/cafe/page.tsx`
- Create: `frontend/src/app/(control-plane)/onboarding/status/page.tsx`
- Test: `frontend/src/components/onboarding/cafe-application-wizard.test.tsx`

**Interfaces:**
- Consumes: `useSubmitCafeApplication`, `CafeApplicationPayload` (Task 10).
- Produces: `<CafeApplicationWizard />`, a four-step form. The page components are thin wrappers, matching how `/admin/onboard-cafe` wraps `CafeOnboardingForm`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/onboarding/cafe-application-wizard.test.tsx`:

```tsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CafeApplicationWizard } from './cafe-application-wizard';

const mutate = vi.fn();
const push = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/hooks/onboarding/use-submit-cafe-application', () => ({
  useSubmitCafeApplication: () => ({ mutate, isPending: false }),
}));

const fill = async (label: RegExp, value: string) => {
  await userEvent.type(screen.getByLabelText(label), value);
};

const advance = async () => userEvent.click(screen.getByRole('button', { name: /continue/i }));

describe('CafeApplicationWizard', () => {
  beforeEach(() => { mutate.mockClear(); push.mockClear(); });

  test('cannot continue past step 1 without an organization name', async () => {
    render(<CafeApplicationWizard />);
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    await fill(/organization name/i, 'Filter Kaapi Co');
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });

  test('cannot continue past step 2 without a name, slug and timezone', async () => {
    render(<CafeApplicationWizard />);
    await fill(/organization name/i, 'Filter Kaapi Co');
    await advance();

    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    await fill(/cafe name/i, 'Filter Kaapi');
    await fill(/cafe address on nextbooq/i, 'filter-kaapi');
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });

  test('rejects a PIN with a leading zero before submitting', async () => {
    render(<CafeApplicationWizard />);
    await fill(/organization name/i, 'Filter Kaapi Co');
    await advance();
    await fill(/cafe name/i, 'Filter Kaapi');
    await fill(/cafe address on nextbooq/i, 'filter-kaapi');
    await advance();
    await fill(/address line 1/i, '12 Church Street');
    await fill(/city/i, 'Bengaluru');
    await fill(/state/i, 'Karnataka');
    await fill(/pin code/i, '060001');

    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    expect(screen.getByText(/6-digit/i)).toBeInTheDocument();
  });

  test('submits the full payload from the review step', async () => {
    render(<CafeApplicationWizard />);
    await fill(/organization name/i, 'Filter Kaapi Co');
    await advance();
    await fill(/cafe name/i, 'Filter Kaapi');
    await fill(/cafe address on nextbooq/i, 'filter-kaapi');
    await advance();
    await fill(/address line 1/i, '12 Church Street');
    await fill(/city/i, 'Bengaluru');
    await fill(/state/i, 'Karnataka');
    await fill(/pin code/i, '560001');
    await advance();

    await userEvent.click(screen.getByRole('button', { name: /submit application/i }));

    expect(mutate).toHaveBeenCalledWith(
      {
        organization_name: 'Filter Kaapi Co',
        cafe_name: 'Filter Kaapi',
        cafe_slug: 'filter-kaapi',
        timezone: 'Asia/Kolkata',
        address: {
          line1: '12 Church Street',
          line2: '',
          landmark: '',
          city: 'Bengaluru',
          state: 'Karnataka',
          postal_code: '560001',
          map_url: '',
        },
      },
      expect.anything()
    );
  });

  test('going back preserves what was already entered', async () => {
    render(<CafeApplicationWizard />);
    await fill(/organization name/i, 'Filter Kaapi Co');
    await advance();
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByLabelText(/organization name/i)).toHaveValue('Filter Kaapi Co');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/onboarding/cafe-application-wizard.test.tsx`
Expected: FAIL — the component does not exist.

- [ ] **Step 3: Build the wizard**

Create `frontend/src/components/onboarding/cafe-application-wizard.tsx` as a `'use client'` component. Model its step machinery on `frontend/src/components/admin/cafe-onboarding-form.tsx` (a `step` state, a `canContinue` derived boolean, `next()`/`back()`), but with the applicant-facing styling of the control-plane pages.

Requirements the tests pin down:
- Steps: 1 Organization, 2 Cafe, 3 Address, 4 Review. Step 4's primary button reads "Submit Application"; steps 1–3 use "Continue", and steps 2–4 also render "Back".
- Every input has an associated `<label htmlFor>`. Exact label text: "Organization name", "Cafe name", "Cafe address on nextBooq" (the slug), "Timezone", "Address line 1", "Address line 2 (optional)", "Landmark (optional)", "City", "State", "PIN code", "Map link (optional)".
- Slug input shows a live preview: `nextbooq.in/{slug}`.
- Timezone defaults to `Asia/Kolkata`.
- PIN validation uses the same rule as the backend, with an inline message containing "6-digit":

```tsx
const INDIAN_PIN_PATTERN = /^[1-9][0-9]{5}$/;
const pinError = postalCode && !INDIAN_PIN_PATTERN.test(postalCode)
  ? 'Enter a valid 6-digit Indian PIN code.'
  : '';
```

- On submit, call `mutate(payload, { onSuccess: () => router.push('/onboarding/status') })` with `payload` exactly as asserted in the test — every address key present, optional ones as `''`.
- Surface a server error inline (read `error.response.data.error.message`, following `apiMessage` in `cafe-onboarding-form.tsx`), so "That cafe address is already taken" from Task 5 is visible to the applicant.

- [ ] **Step 4: Add the two pages**

`frontend/src/app/(control-plane)/onboarding/cafe/page.tsx`:

```tsx
import { CafeApplicationWizard } from '@/components/onboarding/cafe-application-wizard';

export default function OnboardingCafePage() {
  return <CafeApplicationWizard />;
}
```

`frontend/src/app/(control-plane)/onboarding/status/page.tsx` — a `'use client'` page using `useMyCafeApplication()` that shows, for a `pending` application: the reference in a monospace badge, the cafe name and requested address, "We're reviewing your application. We'll email you at {user.email} once it's approved — usually within a couple of working days.", and a "Withdraw application" button wired to `useWithdrawCafeApplication()`. For `approved`, link to `/{cafe_slug}/dashboard`. For `rejected`, show `review_note` and a link back to `/onboarding/cafe`. For no application, redirect to `/onboarding/cafe`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/onboarding && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/onboarding frontend/src/app/\(control-plane\)/onboarding
git commit -m "feat: add the self-serve cafe application wizard and status screen"
```

---

### Task 12: Profile entry point

**Files:**
- Modify: `frontend/src/lib/profile/user-workspace.ts`
- Create: `frontend/src/components/profile/cafe-application-card.tsx`
- Modify: `frontend/src/app/profile/page.tsx`
- Test: `frontend/src/lib/profile/user-workspace.test.ts` (extend)
- Test: `frontend/src/components/profile/cafe-application-card.test.tsx`

**Interfaces:**
- Consumes: `useMyCafeApplication`, `useWithdrawCafeApplication` (Task 10).
- Produces: `getCafeApplicationCardState(user, application)` exported from `user-workspace.ts`, returning `'hidden' | 'apply' | 'pending' | 'rejected'`; and `<CafeApplicationCard />`.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/lib/profile/user-workspace.test.ts`:

```ts
import { getCafeApplicationCardState } from './user-workspace';

const guest = { staff_memberships: [], owner_org_id: null } as any;
const owner = { staff_memberships: [], owner_org_id: 'org_1' } as any;
const manager = {
  staff_memberships: [{ role: 'manager', cafe_id: { _id: 'c1', slug: 'c', name: 'C' } }],
  owner_org_id: null,
} as any;

describe('getCafeApplicationCardState', () => {
  test('offers the apply card to a guest who has never applied', () => {
    expect(getCafeApplicationCardState(guest, null)).toBe('apply');
  });

  test('hides the card from an org owner', () => {
    expect(getCafeApplicationCardState(owner, null)).toBe('hidden');
  });

  test('hides the card from existing cafe staff', () => {
    expect(getCafeApplicationCardState(manager, null)).toBe('hidden');
  });

  test('shows pending status while an application is under review', () => {
    expect(getCafeApplicationCardState(guest, { status: 'pending' } as any)).toBe('pending');
  });

  test('shows the rejection so the applicant can re-apply', () => {
    expect(getCafeApplicationCardState(guest, { status: 'rejected' } as any)).toBe('rejected');
  });

  test('offers the apply card again after a withdrawal', () => {
    expect(getCafeApplicationCardState(guest, { status: 'withdrawn' } as any)).toBe('apply');
  });

  test('hides the card once an application is approved', () => {
    expect(getCafeApplicationCardState(guest, { status: 'approved' } as any)).toBe('hidden');
  });

  test('hides the card from an owner even with a stale pending application', () => {
    expect(getCafeApplicationCardState(owner, { status: 'pending' } as any)).toBe('hidden');
  });
});
```

Create `frontend/src/components/profile/cafe-application-card.test.tsx` covering the four rendered states: the apply card links to `/onboarding/cafe`; the pending card shows the reference and a withdraw button; the rejected card shows the note and a re-apply link; and nothing renders in the hidden state.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/profile src/components/profile`
Expected: FAIL — `getCafeApplicationCardState` is not exported.

- [ ] **Step 3: Add the state helper**

In `frontend/src/lib/profile/user-workspace.ts`:

```ts
import type { CafeApplicationSummary } from '@/lib/types/cafe-application';

export type CafeApplicationCardState = 'hidden' | 'apply' | 'pending' | 'rejected';

// Someone who already owns an org or holds any cafe membership has nothing to
// apply for, so the card disappears for them regardless of application state.
export function getCafeApplicationCardState(
  user: AuthUser | null | undefined,
  application: CafeApplicationSummary | null | undefined
): CafeApplicationCardState {
  if (!user) return 'hidden';
  if (user.owner_org_id) return 'hidden';
  if (user.staff_memberships.length > 0) return 'hidden';

  if (!application) return 'apply';
  if (application.status === 'pending') return 'pending';
  if (application.status === 'rejected') return 'rejected';
  if (application.status === 'approved') return 'hidden';
  return 'apply';
}
```

- [ ] **Step 4: Build the card and mount it**

Create `frontend/src/components/profile/cafe-application-card.tsx` (a `'use client'` component) rendering the four states in the profile page's existing card idiom (`rounded-3xl bg-white shadow-card`, `Building2` from lucide for the icon):

- `apply` — heading "Run a cafe?", body "List your cafe on nextBooq and start taking deposit-secured reservations.", and a link to `/onboarding/cafe` labelled "Register your cafe".
- `pending` — heading "Cafe application under review", the `application_ref` in a monospace badge, the cafe name, the submitted date via `format(new Date(created_at), 'MMMM d, yyyy')`, and a "Withdraw application" button calling `useWithdrawCafeApplication()`.
- `rejected` — heading "Cafe application not approved", the `review_note`, and a link to `/onboarding/cafe` labelled "Update and apply again".
- `hidden` — return `null`.

In `frontend/src/app/profile/page.tsx`, call `useMyCafeApplication(!!user)` and render `<CafeApplicationCard user={user} application={application} />` immediately after the account-details `<section>`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/profile src/components/profile src/app/profile && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/profile frontend/src/components/profile frontend/src/app/profile
git commit -m "feat: add a cafe registration entry point to the profile page"
```

---

### Task 13: Admin review UI and the admin onboarding address step

**Files:**
- Create: `frontend/src/hooks/admin/use-cafe-applications.ts`
- Create: `frontend/src/hooks/admin/use-review-cafe-application.ts`
- Create: `frontend/src/components/admin/cafe-application-review.tsx`
- Create: `frontend/src/app/admin/cafe-applications/page.tsx`
- Create: `frontend/src/app/admin/cafe-applications/[id]/page.tsx`
- Modify: `frontend/src/app/admin/page.tsx`
- Modify: `frontend/src/components/admin/cafe-onboarding-form.tsx`
- Modify: `frontend/src/lib/types/admin-onboarding.ts`
- Test: `frontend/src/components/admin/cafe-application-review.test.tsx`
- Test: `frontend/src/components/admin/cafe-onboarding-form.test.tsx` (extend, or create)

**Interfaces:**
- Consumes: the Task 7 admin endpoints; `CafeAddress` from Task 8.
- Produces: `useCafeApplications(status)`, `useApproveCafeApplication()`, `useRejectCafeApplication()`, `<CafeApplicationReview application={...} />`. `ProvisionCafePayload.cafe` gains `address: CafeAddress`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/admin/cafe-application-review.test.tsx`:

```tsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CafeApplicationReview } from './cafe-application-review';

const approve = vi.fn();
const reject = vi.fn();

vi.mock('@/hooks/admin/use-review-cafe-application', () => ({
  useApproveCafeApplication: () => ({ mutate: approve, isPending: false }),
  useRejectCafeApplication: () => ({ mutate: reject, isPending: false }),
}));

const application = {
  id: 'app_1',
  application_ref: 'NB-7K2M-9QRT',
  status: 'pending' as const,
  organization_name: 'Filter Kaapi Co',
  cafe_name: 'Filter Kaapi',
  cafe_slug: 'filter-kaapi',
  timezone: 'Asia/Kolkata',
  created_at: '2026-08-29T10:00:00.000Z',
  review_note: '',
  address: {
    line1: '12 Church Street', line2: '', landmark: '', city: 'Bengaluru',
    state: 'Karnataka', postal_code: '560001', country: 'India',
    map_url: 'https://maps.google.com/?q=filter+kaapi',
  },
  applicant: { id: 'u1', name: 'Asha Menon', email: 'asha@example.com', phone: '+91 98765 43210' },
};

describe('CafeApplicationReview', () => {
  beforeEach(() => { approve.mockClear(); reject.mockClear(); });

  test('shows everything needed to verify the cafe', () => {
    render(<CafeApplicationReview application={application} />);
    expect(screen.getByText('NB-7K2M-9QRT')).toBeInTheDocument();
    expect(screen.getByText(/asha@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/12 Church Street/)).toBeInTheDocument();
    expect(screen.getByText(/560001/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open in maps/i })).toHaveAttribute(
      'href', 'https://maps.google.com/?q=filter+kaapi'
    );
  });

  test('approves with the chosen subscription terms', async () => {
    render(<CafeApplicationReview application={application} />);
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));

    expect(approve).toHaveBeenCalledWith(
      { id: 'app_1', subscription: { status: 'active', term_months: 12, price_per_month: 7000, note: undefined } },
      expect.anything()
    );
  });

  test('cannot reject without a note', async () => {
    render(<CafeApplicationReview application={application} />);
    await userEvent.click(screen.getByRole('button', { name: /reject/i }));
    expect(reject).not.toHaveBeenCalled();
    expect(screen.getByText(/tell the applicant why/i)).toBeInTheDocument();
  });

  test('rejects with the note once given', async () => {
    render(<CafeApplicationReview application={application} />);
    await userEvent.type(screen.getByLabelText(/rejection note/i), 'Could not verify the address');
    await userEvent.click(screen.getByRole('button', { name: /reject/i }));

    expect(reject).toHaveBeenCalledWith(
      { id: 'app_1', note: 'Could not verify the address' },
      expect.anything()
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/admin/cafe-application-review.test.tsx`
Expected: FAIL — the component does not exist.

- [ ] **Step 3: Add the admin hooks**

`frontend/src/hooks/admin/use-cafe-applications.ts` follows `use-org-cafes.ts`: a `useQuery` on `['admin', 'cafe-applications', status]` hitting `/api/v1/platform-admin/cafe-applications?status={status}`, plus a `useCafeApplication(id)` on `['admin', 'cafe-applications', id]` hitting the detail route.

`frontend/src/hooks/admin/use-review-cafe-application.ts` exports two mutations following `use-provision-cafe.ts`:

```ts
export const useApproveCafeApplication = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, subscription }: { id: string; subscription: ProvisionSubscription }) => {
      const { data } = await axiosInstance.post(`/api/v1/platform-admin/cafe-applications/${id}/approve`, { subscription });
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'cafe-applications'] }),
  });
};
```

and `useRejectCafeApplication` posting `{ note }` to `/reject` with the same invalidation. Reuse the subscription type already declared in `frontend/src/lib/types/admin-onboarding.ts` rather than declaring a second one.

- [ ] **Step 4: Build the review component and pages**

`frontend/src/components/admin/cafe-application-review.tsx` renders, in the admin surface's plain slate styling (see `cafe-onboarding-form.tsx`):
- The reference, applicant name/email/phone, organization, cafe name, requested slug, timezone, the full address, and — when `map_url` is set — a link labelled "Open in maps" with `target="_blank" rel="noopener noreferrer"`.
- A subscription block reusing `TERM_OPTIONS` from `cafe-onboarding-form.tsx` (export it from there rather than duplicating the array), defaulting to `status: 'active'`, `term_months: 12`, `price_per_month: 7000`, with a trial toggle that forces `1` month at `₹0`, exactly as the existing form does.
- "Approve & Provision" and "Reject" buttons. Reject requires a non-empty note; when empty, show the inline message "Tell the applicant why so they can fix it." and do not call the mutation.
- On approve success, `router.push(\`/${result.cafe.slug}/dashboard\`)`.

`frontend/src/app/admin/cafe-applications/page.tsx` lists pending applications — reference, cafe name, requested slug, city, submitted date — each linking to its detail page, with an explicit empty state ("No applications waiting for review.").

`frontend/src/app/admin/cafe-applications/[id]/page.tsx` loads via `useCafeApplication(id)` and renders `<CafeApplicationReview />`.

In `frontend/src/app/admin/page.tsx`, add a link beside the existing "Onboard Cafe" button:

```tsx
<Link href="/admin/cafe-applications" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800">Cafe Applications</Link>
```

- [ ] **Step 5: Add the address step to the direct-onboarding form**

`provisionCafe` now requires an address (Task 2), so `/admin/onboard-cafe` must collect one or every direct-provisioned cafe fails.

In `frontend/src/lib/types/admin-onboarding.ts`, add `address: CafeAddress` to `ProvisionCafePayload['cafe']`.

In `frontend/src/components/admin/cafe-onboarding-form.tsx`:
- Widen the step type from `1 | 2 | 3 | 4 | 5` to `1 | 2 | 3 | 4 | 5 | 6`, and update every `setStep`, `step === 5` submit guard (now `6`), and `next()`/`back()` bound accordingly.
- Insert Address as the new step 4 (after Cafe, before Subscription), with the same seven fields and the same `INDIAN_PIN_PATTERN` inline validation as the applicant wizard.
- Add the address to `canContinue` for that step and to the submitted `payload.cafe`.
- Add the seven fields to `reset()`.

Add a test asserting the submitted payload carries the address, in `frontend/src/components/admin/cafe-onboarding-form.test.tsx` (create the file following `cafe-application-review.test.tsx`'s mocking if it does not exist).

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/admin && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Run the whole suite, both sides**

Run: `cd backend && npx jest --runInBand` then `cd ../frontend && npx vitest run && npm run typecheck && npm run lint`
Expected: PASS everywhere.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/hooks/admin frontend/src/components/admin frontend/src/app/admin frontend/src/lib/types/admin-onboarding.ts
git commit -m "feat: platform-admin cafe application review screens"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: shared address shape and `validateAddress` → Task 1; `Cafe.address`/`location`/2dsphere, `provisionCafe` requiring an address, and the `RESERVED_SLUGS` fix → Task 2; `CafeApplication` and `application_ref` → Task 3; `User.account_type`, the derived `cafe_application` on the auth payload, and `PATCH /auth/account-type` → Task 4; applicant endpoints, the rate limiter, and the advisory slug check → Task 5; the review email, `ADMIN_EMAIL`, and the decision emails → Task 6; admin list/detail/approve/reject with `provisionCafe` as the sole writer → Task 7; `updateCafe` address and the settings UI → Task 8; the storefront tile → Task 9; the `source=register` fork, route-guard protection, types, hooks, and the role choice → Task 10; the wizard and status screen → Task 11; the profile entry point → Task 12; the admin review UI and the admin form's new address step → Task 13.

**Known deliberate gap.** The spec lists an applicant confirmation email on submit under Follow-ups, not requirements, so no task implements it.

**Type consistency.** `validateAddress` returns the same eight keys everywhere it is used. `summarize()` defines `{ id, application_ref, status, cafe_slug, cafe_name, created_at, review_note }` in Task 4 and every later consumer — the auth payload, the applicant endpoints, `withApplicant`, the profile card, and the admin review — uses exactly those names. `CafeAddress` (Task 8) is the single frontend address type, imported by `CafeApplicationPayload` (Task 10), the wizard (Task 11), and `ProvisionCafePayload` (Task 13). `TERM_OPTIONS` is exported from `cafe-onboarding-form.tsx` and imported by the review component rather than duplicated.

**Ordering constraint.** Task 2 makes `address` required in `provisionCafe`, which breaks `/admin/onboard-cafe` until Task 13 adds the address step. Tasks 2 through 13 must therefore all land before this branch merges; do not ship a partial series.
