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
});
