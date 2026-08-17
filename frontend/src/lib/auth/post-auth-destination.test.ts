import { describe, expect, test } from 'vitest';
import { resolvePostAuthDestination } from './post-auth-destination';

const customer = {
  id: 'customer-1',
  name: 'Customer',
  email: 'customer@example.com',
  staff_memberships: [],
  is_platform_admin: false,
  owner_org_id: null,
  is_email_verified: true,
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

  describe('subdomain access (currentHost identifies a cafe subdomain)', () => {
    test('omits the slug prefix when logging in from that cafe\'s own subdomain', () => {
      expect(resolvePostAuthDestination(staffUser, null, 'cafe-one.nextbooq.in')).toBe('/dashboard');
    });

    test('still prefixes the slug when logging in from a different cafe\'s subdomain', () => {
      expect(resolvePostAuthDestination(staffUser, null, 'some-other-cafe.nextbooq.in')).toBe('/cafe-one/dashboard');
    });

    test('still prefixes the slug for path-based access (apex/non-subdomain host)', () => {
      expect(resolvePostAuthDestination(staffUser, null, 'nextbooq.in')).toBe('/cafe-one/dashboard');
    });

    test('strips a redundant slug-prefixed staff callback when already on that subdomain', () => {
      expect(resolvePostAuthDestination(staffUser, '/cafe-one/reservations?date=2026-08-15', 'cafe-one.nextbooq.in'))
        .toBe('/reservations?date=2026-08-15');
    });

    test('leaves a staff callback for a different cafe than the current subdomain unchanged', () => {
      // Not this cafe's own callback and not a recognized membership match for
      // "cafe-two" via the subdomain either — falls through to the fallback,
      // which correctly still targets the user's actual (only) cafe.
      expect(resolvePostAuthDestination(staffUser, '/cafe-one/dashboard', 'some-other-cafe.nextbooq.in'))
        .toBe('/cafe-one/dashboard');
    });

    test('strips a redundant slug-prefixed customer callback when already on that subdomain', () => {
      expect(resolvePostAuthDestination(customer, '/cafe-one/my-reservations', 'cafe-one.nextbooq.in'))
        .toBe('/my-reservations');
    });

    test('does not strip a customer callback for a different cafe than the current subdomain', () => {
      expect(resolvePostAuthDestination(customer, '/cafe-two/my-reservations', 'cafe-one.nextbooq.in'))
        .toBe('/cafe-two/my-reservations');
    });

    test('org owner and platform admin destinations are unaffected by a subdomain host', () => {
      const orgOwner = { ...staffUser, owner_org_id: 'org-1' };
      expect(resolvePostAuthDestination(orgOwner, null, 'cafe-one.nextbooq.in')).toBe('/org/dashboard');

      const admin = { ...customer, is_platform_admin: true };
      expect(resolvePostAuthDestination(admin, null, 'cafe-one.nextbooq.in')).toBe('/admin');
    });
  });
});
