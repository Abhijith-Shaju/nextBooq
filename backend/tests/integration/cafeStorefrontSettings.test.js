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
      is_email_verified: true,
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

  test('rejects a hero_image_url that is not https', async () => {
    const res = await putSettings({ hero_image_url: 'ftp://example.com/hero.jpg' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/hero_image_url/i);
  });

  test('rejects a hero_image_url that is http (not https)', async () => {
    const res = await putSettings({ hero_image_url: 'http://example.com/hero.jpg' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/hero_image_url/i);
  });

  test('rejects a malformed https hero_image_url', async () => {
    const res = await putSettings({ hero_image_url: 'https://not a valid url' });

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

  // A customer with an issue/query needs a way to reach the cafe directly —
  // saved here alongside the rest of the storefront fields and surfaced on
  // the public getCafeBySlug endpoint the same way.
  test('saves a contact_phone and it appears on the public storefront endpoint', async () => {
    const res = await putSettings({ contact_phone: '+91 98765 43210' });

    expect(res.status).toBe(200);
    expect(res.body.data.contact_phone).toBe('+91 98765 43210');

    const publicRes = await request(app).get(`/api/v1/cafes/slug/${cafe.slug}`);
    expect(publicRes.body.data.contact_phone).toBe('+91 98765 43210');
  });

  test('a cafe that never sets contact_phone keeps it empty', async () => {
    const res = await putSettings({ description: 'No phone yet.' });
    expect(res.body.data.contact_phone).toBe('');
  });

  test('trims contact_phone and allows clearing it back to empty', async () => {
    await putSettings({ contact_phone: '  +91 98765 43210  ' });
    const cleared = await putSettings({ contact_phone: '' });

    expect(cleared.status).toBe(200);
    expect(cleared.body.data.contact_phone).toBe('');

    const persisted = await Cafe.findById(cafe._id);
    expect(persisted.contact_phone).toBe('');
  });

  test('rejects a contact_phone that is not a string', async () => {
    const res = await putSettings({ contact_phone: 12345 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/contact_phone/i);
  });

  test('rejects a contact_phone longer than 30 characters', async () => {
    const res = await putSettings({ contact_phone: '1'.repeat(31) });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/contact_phone/i);
  });

  describe('logo', () => {
    test('saves a logo_url and serves it from the public storefront endpoint', async () => {
      const res = await putSettings({ logo_url: 'https://cdn.example.com/logo.png' });

      expect(res.status).toBe(200);
      expect(res.body.data.logo_url).toBe('https://cdn.example.com/logo.png');

      const publicRes = await request(app).get(`/api/v1/cafes/slug/${cafe.slug}`);
      expect(publicRes.body.data.logo_url).toBe('https://cdn.example.com/logo.png');
    });

    test('a cafe that never sets a logo keeps it empty', async () => {
      const res = await putSettings({ description: 'unrelated' });
      expect(res.body.data.logo_url).toBe('');
    });

    test('rejects a non-https logo_url', async () => {
      const res = await putSettings({ logo_url: 'http://cdn.example.com/logo.png' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/logo_url/i);
    });

    test('allows clearing the logo back to empty', async () => {
      await putSettings({ logo_url: 'https://cdn.example.com/logo.png' });
      const cleared = await putSettings({ logo_url: '' });

      expect(cleared.status).toBe(200);
      expect(cleared.body.data.logo_url).toBe('');
    });
  });

  describe('brand colours', () => {
    test('saves brand colours and serves them from the public storefront endpoint', async () => {
      const res = await putSettings({ brand_primary: '#1B7F5A', brand_accent: '#E4A11B' });

      expect(res.status).toBe(200);
      expect(res.body.data.brand_primary).toBe('#1B7F5A');
      expect(res.body.data.brand_accent).toBe('#E4A11B');

      // The storefront reads these through the public slug endpoint to build
      // its palette, so they have to survive that route specifically.
      const publicRes = await request(app).get(`/api/v1/cafes/slug/${cafe.slug}`);
      expect(publicRes.body.data.brand_primary).toBe('#1B7F5A');
      expect(publicRes.body.data.brand_accent).toBe('#E4A11B');
    });

    test('a cafe that never sets brand colours keeps them empty, so the default palette applies', async () => {
      const res = await putSettings({ description: 'unrelated' });
      expect(res.body.data.brand_primary).toBe('');
      expect(res.body.data.brand_accent).toBe('');
    });

    test('accepts shorthand 3-digit hex', async () => {
      const res = await putSettings({ brand_primary: '#0A0' });
      expect(res.status).toBe(200);
      expect(res.body.data.brand_primary).toBe('#0A0');
    });

    test('clearing a brand colour returns the cafe to the default palette', async () => {
      await putSettings({ brand_primary: '#1B7F5A' });
      const cleared = await putSettings({ brand_primary: '' });

      expect(cleared.status).toBe(200);
      expect(cleared.body.data.brand_primary).toBe('');
    });

    // These land verbatim in a CSS custom property the storefront palette is
    // built from, so anything that isn't a plain hex colour is refused.
    test.each([
      ['a bare HSL triplet, which renders as nothing when used unwrapped', '220 89% 53%'],
      ['a named colour', 'rebeccapurple'],
      ['an rgb() function', 'rgb(200, 16, 46)'],
      ['a CSS injection attempt', '#fff; background: url(https://evil.test)'],
      ['a malformed hex', '#12345'],
      ['a non-string', 123],
    ])('rejects %s', async (_label, value) => {
      const res = await putSettings({ brand_primary: value });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/brand_primary/i);
    });

    test('validates brand_accent the same way as brand_primary', async () => {
      const res = await putSettings({ brand_accent: 'goldenrod' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/brand_accent/i);
    });
  });
});
