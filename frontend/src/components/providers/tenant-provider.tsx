'use client';

import { createContext, useContext, useEffect, ReactNode, CSSProperties } from 'react';
import { Cafe } from '@/lib/types/models';
import { resolveTenantTheme } from '@/lib/theme/resolve-tenant-theme';
import { useBookingStore } from '@/store/use-booking-store';
import { useDashboardStore } from '@/store/use-dashboard-store';

interface TenantContextType {
  cafe: Cafe;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ cafe, children }: { cafe: Cafe; children: ReactNode }) {
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

  return (
    <TenantContext.Provider value={{ cafe }}>
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
