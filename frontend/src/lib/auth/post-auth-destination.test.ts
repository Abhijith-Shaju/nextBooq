import { describe, expect, test } from 'vitest';
import { resolvePostAuthDestination } from './post-auth-destination';

const customer = {
  id: 'customer-1',
  name: 'Customer',
  email: 'customer@example.com',
  staff_memberships: [],
  is_platform_admin: false,
  owner_org_id: null,
};

const staffUser = {
  ...customer,
  id: 'staff-1',
  staff_memberships: [
    { cafe_id: { id: 'cafe-1', name: 'Cafe One', slug: 'cafe-one' }, role: 'staff' as const, permissions: [] },
  ],
};

describe('resolvePostAuthDestination', () => {
  test('routes a customer without a callback to home', () => {
    expect(resolvePostAuthDestination(customer)).toBe('/');
  });

  test('routes staff to their first valid cafe dashboard', () => {
    expect(resolvePostAuthDestination(staffUser)).toBe('/cafe-one/dashboard');
  });

  test('skips invalid memberships to find a later valid cafe', () => {
    expect(resolvePostAuthDestination({
      ...staffUser,
      staff_memberships: [
        { cafe_id: 'missing-cafe', role: 'staff', permissions: [] },
        { cafe_id: { id: 'cafe-2', name: 'Cafe Two', slug: 'cafe-two' }, role: 'manager', permissions: [] },
      ],
    })).toBe('/cafe-two/dashboard');
  });

  test('ignores memberships with an unrecognized runtime role', () => {
    expect(resolvePostAuthDestination({
      ...staffUser,
      staff_memberships: [
        { cafe_id: { id: 'cafe-1', name: 'Cafe One', slug: 'cafe-one' }, role: 'guest' as any, permissions: [] },
        { cafe_id: { id: 'cafe-2', name: 'Cafe Two', slug: 'cafe-two' }, role: 'host', permissions: [] },
      ],
    })).toBe('/cafe-two/dashboard');
  });

  test('prioritizes the platform admin home even when the user has cafe membership', () => {
    expect(resolvePostAuthDestination({ ...staffUser, is_platform_admin: true })).toBe('/admin');
  });

  test('accepts only matching tenant dashboard callbacks for staff', () => {
    expect(resolvePostAuthDestination(staffUser, '/cafe-one/reservations?date=2026-08-15#today'))
      .toBe('/cafe-one/reservations?date=2026-08-15#today');
    expect(resolvePostAuthDestination(staffUser, '/cafe-two/dashboard')).toBe('/cafe-one/dashboard');
  });

  test('accepts a safe customer callback but rejects privileged and external callbacks', () => {
    expect(resolvePostAuthDestination(customer, '/cafe-one/my-reservations')).toBe('/cafe-one/my-reservations');
    expect(resolvePostAuthDestination(customer, '/admin')).toBe('/');
    expect(resolvePostAuthDestination(customer, 'https://evil.example')).toBe('/');
    expect(resolvePostAuthDestination(customer, '//evil.example')).toBe('/');
    expect(resolvePostAuthDestination(customer, '/onboarding')).toBe('/');
  });

  test('allows admins to resume only admin callbacks', () => {
    const admin = { ...customer, is_platform_admin: true };
    expect(resolvePostAuthDestination(admin, '/admin/onboard-cafe')).toBe('/admin/onboard-cafe');
    expect(resolvePostAuthDestination(admin, '/cafe-one/dashboard')).toBe('/admin');
  });

  test('routes an org owner to the org dashboard even with only one cafe', () => {
    const orgOwner = { ...staffUser, owner_org_id: 'org-1' };
    expect(resolvePostAuthDestination(orgOwner)).toBe('/org/dashboard');
  });

  test('org owner takes priority over cafe-specific callback urls, but not over platform admin', () => {
    const orgOwner = { ...staffUser, owner_org_id: 'org-1' };
    expect(resolvePostAuthDestination(orgOwner, '/cafe-one/dashboard')).toBe('/org/dashboard');

    const orgOwnerAdmin = { ...orgOwner, is_platform_admin: true };
    expect(resolvePostAuthDestination(orgOwnerAdmin)).toBe('/admin');
  });

  test('a manager-only user (owner_org_id null) is unaffected and still goes to their cafe', () => {
    expect(resolvePostAuthDestination({ ...staffUser, owner_org_id: null })).toBe('/cafe-one/dashboard');
  });
});
