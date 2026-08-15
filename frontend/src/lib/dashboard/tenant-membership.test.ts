import { describe, expect, test } from 'vitest';
import { hasStaffMembershipForCafe } from './tenant-membership';
import type { User } from '@/lib/types/models';

const makeUser = (staff_memberships: User['staff_memberships']): User => ({
  id: 'u1',
  email: 'u1@test.com',
  name: 'User One',
  staff_memberships,
  is_platform_admin: false,
  owner_org_id: null,
});

describe('hasStaffMembershipForCafe', () => {
  test('returns false when user is null', () => {
    expect(hasStaffMembershipForCafe(null, 'cafe_a')).toBe(false);
  });

  test('returns false when cafeId is undefined', () => {
    const user = makeUser([{ cafe_id: 'cafe_a', role: 'host', permissions: [] }]);
    expect(hasStaffMembershipForCafe(user, undefined)).toBe(false);
  });

  test('returns true when the user has a membership with a plain string cafe_id matching', () => {
    const user = makeUser([{ cafe_id: 'cafe_a', role: 'host', permissions: [] }]);
    expect(hasStaffMembershipForCafe(user, 'cafe_a')).toBe(true);
  });

  test('returns false when the user has memberships but none match this cafe', () => {
    const user = makeUser([{ cafe_id: 'cafe_b', role: 'host', permissions: [] }]);
    expect(hasStaffMembershipForCafe(user, 'cafe_a')).toBe(false);
  });

  test('matches a populated cafe_id object (id field)', () => {
    const user = makeUser([
      { cafe_id: { id: 'cafe_a', slug: 'cafe-a', name: 'Cafe A', timezone: 'UTC', reservation_rules: {} as any }, role: 'owner', permissions: [] },
    ]);
    expect(hasStaffMembershipForCafe(user, 'cafe_a')).toBe(true);
  });

  test('returns false for a user with no memberships at all', () => {
    const user = makeUser([]);
    expect(hasStaffMembershipForCafe(user, 'cafe_a')).toBe(false);
  });
});
