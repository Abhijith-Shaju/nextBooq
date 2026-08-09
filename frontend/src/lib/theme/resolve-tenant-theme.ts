export interface TenantTheme {
  brandPrimary: string;
  brandAccent: string;
}

// Default "Token Counter" palette: terracotta primary (CTAs, welcome moments),
// brass accent (stamps, holds, countdown, confirmation) — see PRODUCT.md brand
// commitments and the approved booking-flow prototype.
export const DEFAULT_TENANT_THEME: TenantTheme = {
  brandPrimary: '#C8102E',
  brandAccent: '#A8752E',
};

export function resolveTenantTheme(cafe: { brand_primary?: string; brand_accent?: string }): TenantTheme {
  return {
    brandPrimary: cafe.brand_primary || DEFAULT_TENANT_THEME.brandPrimary,
    brandAccent: cafe.brand_accent || DEFAULT_TENANT_THEME.brandAccent,
  };
}
