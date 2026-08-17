'use client';

import { createContext, useCallback, useContext, useEffect, ReactNode, CSSProperties } from 'react';
import { Cafe } from '@/lib/types/models';
import { resolveTenantTheme } from '@/lib/theme/resolve-tenant-theme';
import { useBookingStore } from '@/store/use-booking-store';
import { useDashboardStore } from '@/store/use-dashboard-store';

/**
 * Builds an internal link/redirect target for the current cafe. `path` is
 * the tenant-relative part (e.g. "/dashboard", or "/" for the cafe's own
 * root) — this prepends the cafe's slug only when that slug isn't already
 * implied by the Host header (path-based access, e.g. nextbooq.in/vtcafe/...).
 * On a cafe subdomain (vtcafe.nextbooq.in/...) the slug is already in the
 * host, so prepending it again would double it in the URL and 404 (the
 * [tenant] dynamic route would then see "vtcafe/vtcafe/dashboard" as its
 * params.tenant + a nonexistent nested route).
 */
export function buildTenantPath(cafe: Pick<Cafe, 'slug'>, path: string, isSubdomainAccess: boolean): string {
  const normalized = path === '/' || path === '' ? '' : path.startsWith('/') ? path : `/${path}`;
  if (isSubdomainAccess) return normalized || '/';
  return `/${cafe.slug}${normalized}`;
}

interface TenantContextType {
  cafe: Cafe;
  tenantPath: (path: string) => string;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({
  cafe,
  isSubdomainAccess = false,
  children,
}: {
  cafe: Cafe;
  isSubdomainAccess?: boolean;
  children: ReactNode;
}) {
  const theme = resolveTenantTheme(cafe);
  const themeStyle = {
    '--brand-primary': theme.brandPrimary,
    '--brand-accent': theme.brandAccent,
  } as CSSProperties;

  // Both stores hold state scoped to "the tenant currently being viewed"
  // (an in-progress booking, dashboard drawer/filter selections). On a
  // shared browser tab, navigating to a different tenant without those
  // being cleared would leak one cafe's UI/booking state into another's.
  useEffect(() => {
    useBookingStore.getState().resetBooking();
    useDashboardStore.getState().reset();
  }, [cafe.id]);

  const tenantPath = useCallback(
    (path: string) => buildTenantPath(cafe, path, isSubdomainAccess),
    [cafe, isSubdomainAccess]
  );

  return (
    <TenantContext.Provider value={{ cafe, tenantPath }}>
      <div style={themeStyle}>{children}</div>
    </TenantContext.Provider>
  );
}

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
