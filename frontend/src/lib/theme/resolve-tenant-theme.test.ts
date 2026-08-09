import { describe, expect, test } from 'vitest';
import { resolveTenantTheme, DEFAULT_TENANT_THEME } from './resolve-tenant-theme';

describe('resolveTenantTheme', () => {
  test('falls back to the default token set when a cafe has no brand overrides', () => {
    expect(resolveTenantTheme({})).toEqual(DEFAULT_TENANT_THEME);
  });

  test('uses the cafe brand_primary when provided, keeping the default accent', () => {
    expect(resolveTenantTheme({ brand_primary: '#2E7D32' })).toEqual({
      ...DEFAULT_TENANT_THEME,
      brandPrimary: '#2E7D32',
    });
  });

  test('uses both cafe overrides when both are provided', () => {
    expect(resolveTenantTheme({ brand_primary: '#2E7D32', brand_accent: '#F9A825' })).toEqual({
      brandPrimary: '#2E7D32',
      brandAccent: '#F9A825',
    });
  });

  test('ignores an empty-string override and falls back to the default', () => {
    expect(resolveTenantTheme({ brand_primary: '' })).toEqual(DEFAULT_TENANT_THEME);
  });
});
