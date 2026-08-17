import { describe, test, expect } from 'vitest';
import { resolveTenantRewrite } from './tenant-domain';

describe('resolveTenantRewrite', () => {
  test('rewrites a cafe subdomain root request to the tenant path route', () => {
    expect(resolveTenantRewrite('blackshores.nextbooq.in', '/')).toBe('/blackshores');
  });

  test('rewrites a cafe subdomain sub-path to the equivalent tenant path route', () => {
    expect(resolveTenantRewrite('blackshores.nextbooq.in', '/dashboard')).toBe('/blackshores/dashboard');
    expect(resolveTenantRewrite('blackshores.nextbooq.in', '/checkout')).toBe('/blackshores/checkout');
    expect(resolveTenantRewrite('blackshores.nextbooq.in', '/my-reservations')).toBe('/blackshores/my-reservations');
  });

  test('strips the port from the host header before matching', () => {
    expect(resolveTenantRewrite('blackshores.nextbooq.in:443', '/')).toBe('/blackshores');
  });

  test('does not rewrite the apex domain', () => {
    expect(resolveTenantRewrite('nextbooq.in', '/')).toBeNull();
    expect(resolveTenantRewrite('nextbooq.in', '/admin')).toBeNull();
  });

  test('does not rewrite the www subdomain', () => {
    expect(resolveTenantRewrite('www.nextbooq.in', '/')).toBeNull();
  });

  test('does not rewrite a host that is not a subdomain of the root domain', () => {
    expect(resolveTenantRewrite('nextbooq-git-main-abhijith.vercel.app', '/')).toBeNull();
    expect(resolveTenantRewrite('localhost', '/')).toBeNull();
    expect(resolveTenantRewrite('evil-nextbooq.in', '/')).toBeNull();
  });

  test('returns null when there is no host header', () => {
    expect(resolveTenantRewrite(null, '/')).toBeNull();
  });

  test('leaves reserved top-level paths unprefixed so they keep resolving to the real route', () => {
    expect(resolveTenantRewrite('blackshores.nextbooq.in', '/auth/login')).toBeNull();
    expect(resolveTenantRewrite('blackshores.nextbooq.in', '/admin')).toBeNull();
    expect(resolveTenantRewrite('blackshores.nextbooq.in', '/org/dashboard')).toBeNull();
    expect(resolveTenantRewrite('blackshores.nextbooq.in', '/onboarding')).toBeNull();
  });

  test('does not treat a path merely starting with a reserved prefix as reserved', () => {
    // Guards against a naive startsWith('/auth') check matching something
    // like a hypothetical "/authentic-cafe" tenant slug's own root path.
    expect(resolveTenantRewrite('blackshores.nextbooq.in', '/authentic')).toBe('/blackshores/authentic');
  });

  test('ignores an unexpected nested subdomain', () => {
    expect(resolveTenantRewrite('foo.blackshores.nextbooq.in', '/')).toBeNull();
  });
});
