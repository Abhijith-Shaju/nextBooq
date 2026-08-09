'use client';

import { createContext, useContext, ReactNode, CSSProperties } from 'react';
import { Cafe } from '@/lib/types/models';
import { resolveTenantTheme } from '@/lib/theme/resolve-tenant-theme';

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
