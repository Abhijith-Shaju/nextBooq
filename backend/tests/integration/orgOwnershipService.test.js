const { getOwnedOrgId } = require('../../src/services/orgOwnershipService');
const Organization = require('../../src/models/Organization');
const Cafe = require('../../src/models/Cafe');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');

setupTestDB();

const ACTIVE_STAFF_MEMBERSHIP_POPULATE = {
  path: 'staff_memberships.cafe_id',
  select: 'name slug timezone org_id',
  match: { is_deleted: false },
};

describe('getOwnedOrgId', () => {
  test('returns the org id when the user owns every cafe in that org', async () => {
    const org = await Organization.create({ name: 'Two Cafe Org' });
    const cafeA = await Cafe.create({ org_id: org._id, name: 'A', slug: 'org-owner-a', timezone: 'UTC' });
    const cafeB = await Cafe.create({ org_id: org._id, name: 'B', slug: 'org-owner-b', timezone: 'UTC' });

    const user = await User.create({
      name: 'Owner',
      email: 'owner-both@example.com',
      phone: '+15550200001',
      password_hash: 'hash',
      staff_memberships: [
        { cafe_id: cafeA._id, role: 'owner', permissions: [] },
        { cafe_id: cafeB._id, role: 'owner', permissions: [] },
      ],
    });
    const populated = await User.findById(user._id).populate(ACTIVE_STAFF_MEMBERSHIP_POPULATE);

    await expect(getOwnedOrgId(populated)).resolves.toBe(org._id.toString());
  });

  test('returns null when the user owns only some of the org\'s cafes', async () => {
    const org = await Organization.create({ name: 'Partial Owner Org' });
    const cafeA = await Cafe.create({ org_id: org._id, name: 'A', slug: 'org-partial-a', timezone: 'UTC' });
    await Cafe.create({ org_id: org._id, name: 'B', slug: 'org-partial-b', timezone: 'UTC' });

    const user = await User.create({
      name: 'Partial Owner',
      email: 'owner-partial@example.com',
      phone: '+15550200002',
      password_hash: 'hash',
      staff_memberships: [{ cafe_id: cafeA._id, role: 'owner', permissions: [] }],
    });
    const populated = await User.findById(user._id).populate(ACTIVE_STAFF_MEMBERSHIP_POPULATE);

    await expect(getOwnedOrgId(populated)).resolves.toBeNull();
  });

  test('returns the org id for a single-cafe org the user owns', async () => {
    const org = await Organization.create({ name: 'Single Cafe Org' });
    const cafe = await Cafe.create({ org_id: org._id, name: 'Solo', slug: 'org-solo', timezone: 'UTC' });

    const user = await User.create({
      name: 'Solo Owner',
      email: 'owner-solo@example.com',
      phone: '+15550200003',
      password_hash: 'hash',
      staff_memberships: [{ cafe_id: cafe._id, role: 'owner', permissions: [] }],
    });
    const populated = await User.findById(user._id).populate(ACTIVE_STAFF_MEMBERSHIP_POPULATE);

    await expect(getOwnedOrgId(populated)).resolves.toBe(org._id.toString());
  });

  test('returns null for a manager who owns nothing', async () => {
    const org = await Organization.create({ name: 'Manager Only Org' });
    const cafe = await Cafe.create({ org_id: org._id, name: 'M', slug: 'org-manager-only', timezone: 'UTC' });

    const user = await User.create({
      name: 'Manager',
      email: 'manager-only@example.com',
      phone: '+15550200004',
      password_hash: 'hash',
      staff_memberships: [{ cafe_id: cafe._id, role: 'manager', permissions: [] }],
    });
    const populated = await User.findById(user._id).populate(ACTIVE_STAFF_MEMBERSHIP_POPULATE);

    await expect(getOwnedOrgId(populated)).resolves.toBeNull();
  });

  test('returns null for a user with no memberships', async () => {
    const user = await User.create({
      name: 'Nobody',
      email: 'nobody@example.com',
      phone: '+15550200005',
      password_hash: 'hash',
      staff_memberships: [],
    });
    const populated = await User.findById(user._id).populate(ACTIVE_STAFF_MEMBERSHIP_POPULATE);

    await expect(getOwnedOrgId(populated)).resolves.toBeNull();
  });

  test('ignores a soft-deleted cafe the user was owner of when checking coverage', async () => {
    const org = await Organization.create({ name: 'Deleted Cafe Org' });
    const cafeA = await Cafe.create({ org_id: org._id, name: 'A', slug: 'org-deleted-a', timezone: 'UTC' });
    await Cafe.create({ org_id: org._id, name: 'B', slug: 'org-deleted-b', timezone: 'UTC', is_deleted: true });

    const user = await User.create({
      name: 'Owner',
      email: 'owner-deleted-cafe@example.com',
      phone: '+15550200006',
      password_hash: 'hash',
      staff_memberships: [{ cafe_id: cafeA._id, role: 'owner', permissions: [] }],
    });
    const populated = await User.findById(user._id).populate(ACTIVE_STAFF_MEMBERSHIP_POPULATE);

    await expect(getOwnedOrgId(populated)).resolves.toBe(org._id.toString());
  });

  test('returns null when duplicate owner memberships point at the same cafe in a 2-cafe org', async () => {
    const org = await Organization.create({ name: 'Duplicate Membership Org' });
    const cafeA = await Cafe.create({ org_id: org._id, name: 'A', slug: 'org-dup-a', timezone: 'UTC' });
    await Cafe.create({ org_id: org._id, name: 'B', slug: 'org-dup-b', timezone: 'UTC' });

    const user = await User.create({
      name: 'Duplicate Owner',
      email: 'owner-duplicate@example.com',
      phone: '+15550200007',
      password_hash: 'hash',
      staff_memberships: [
        { cafe_id: cafeA._id, role: 'owner', permissions: [] },
        { cafe_id: cafeA._id, role: 'owner', permissions: [] },
      ],
    });
    const populated = await User.findById(user._id).populate(ACTIVE_STAFF_MEMBERSHIP_POPULATE);

    await expect(getOwnedOrgId(populated)).resolves.toBeNull();
  });
});
