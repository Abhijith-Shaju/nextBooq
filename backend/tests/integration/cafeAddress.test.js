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
