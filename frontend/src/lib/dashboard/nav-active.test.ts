import { describe, expect, test } from 'vitest';
import { isNavItemActive } from './nav-active';

describe('isNavItemActive', () => {
  test('matches an exact href', () => {
    expect(isNavItemActive('/marigold/tables', { href: '/marigold/tables' })).toBe(true);
  });

  test('does not match a different href', () => {
    expect(isNavItemActive('/marigold/tables', { href: '/marigold/settings' })).toBe(false);
  });

  test('the Host Stand item matches any path ending in /dashboard', () => {
    expect(isNavItemActive('/marigold/dashboard', { href: '/marigold/dashboard', label: 'Host Stand' })).toBe(true);
  });

  test('the Host Stand item does not match an unrelated path', () => {
    expect(isNavItemActive('/marigold/tables', { href: '/marigold/dashboard', label: 'Host Stand' })).toBe(false);
  });

  test('a non-Host-Stand item is never active via the /dashboard suffix rule', () => {
    expect(isNavItemActive('/marigold/dashboard', { href: '/marigold/settings', label: 'Cafe Settings' })).toBe(
      false
    );
  });
});
