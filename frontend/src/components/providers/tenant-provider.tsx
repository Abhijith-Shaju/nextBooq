'use client';

import { createContext, useContext, ReactNode } from 'react';
import { Cafe } from '@/lib/types/models';

interface TenantContextType {
  cafe: Cafe;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ cafe, children }: { cafe: Cafe; children: ReactNode }) {
  return (
    <TenantContext.Provider value={{ cafe }}>
      {children}
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
