import { describe, expect, test } from 'vitest';
import { AuthUser } from '@/lib/types/auth';
import { getProfileRole, getManagerCafes, getOwnedCafesFromMemberships } from './user-workspace';

function makeUser(overrides: Partial<AuthUser>): AuthUser {
  return {
    id: 'user-1',
    email: 'user@test.com',
    name: 'Test User',
    staff_memberships: [],
    is_platform_admin: false,
    owner_org_id: null,
    is_email_verified: true,
    ...overrides,
  };
}

describe('getProfileRole', () => {
  test('returns guest for null user', () => {
    expect(getProfileRole(null)).toBe('guest');
  });

  test('returns guest for a user with no staff memberships', () => {
    expect(getProfileRole(makeUser({}))).toBe('guest');
  });

  test('returns owner when owner_org_id is set, regardless of staff_memberships', () => {
    expect(getProfileRole(makeUser({ owner_org_id: 'org-1' }))).toBe('owner');
  });

  test('returns manager when the user has a manager membership on a populated cafe', () => {
    const user = makeUser({
      staff_memberships: [
        { cafe_id: { name: 'Cafe A', slug: 'cafe-a' }, role: 'manager', permissions: [] },
      ],
    });
    expect(getProfileRole(user)).toBe('manager');
  });

  test('returns guest when a manager membership has an unpopulated (string) cafe_id', () => {
    const user = makeUser({
      staff_memberships: [{ cafe_id: 'cafe-a', role: 'manager', permissions: [] }],
    });
    expect(getProfileRole(user)).toBe('guest');
  });

  test('prefers owner over manager when both apply', () => {
    const user = makeUser({
      owner_org_id: 'org-1',
      staff_memberships: [{ cafe_id: { name: 'Cafe A', slug: 'cafe-a' }, role: 'manager', permissions: [] }],
    });
    expect(getProfileRole(user)).toBe('owner');
  });

  test('returns guest for a host or staff role membership', () => {
    const user = makeUser({
      staff_memberships: [{ cafe_id: { name: 'Cafe A', slug: 'cafe-a' }, role: 'host', permissions: [] }],
    });
    expect(getProfileRole(user)).toBe('guest');
  });
});

describe('getManagerCafes / getOwnedCafesFromMemberships', () => {
  test('filters to only the requested role and only populated cafes', () => {
    const user = makeUser({
      staff_memberships: [
        { cafe_id: { name: 'Owned Cafe', slug: 'owned-cafe' }, role: 'owner', permissions: [] },
        { cafe_id: { name: 'Managed Cafe', slug: 'managed-cafe' }, role: 'manager', permissions: [] },
        { cafe_id: 'unpopulated-cafe', role: 'manager', permissions: [] },
      ],
    });

    expect(getOwnedCafesFromMemberships(user)).toEqual([{ name: 'Owned Cafe', slug: 'owned-cafe' }]);
    expect(getManagerCafes(user)).toEqual([{ name: 'Managed Cafe', slug: 'managed-cafe' }]);
  });

  test('returns an empty array for a null user', () => {
    expect(getManagerCafes(null)).toEqual([]);
    expect(getOwnedCafesFromMemberships(null)).toEqual([]);
  });
});
