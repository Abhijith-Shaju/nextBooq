'use client';

import React, { createContext, useContext, useEffect } from 'react';
import { CafeBranding } from '@/types';

interface TenantThemeContextType {
  branding?: CafeBranding;
}

const TenantThemeContext = createContext<TenantThemeContextType>({});

export function TenantThemeProvider({
  branding,
  children,
}: {
  branding?: CafeBranding;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (branding?.primary_color) {
      document.documentElement.style.setProperty('--tenant-primary', branding.primary_color);
    } else {
      document.documentElement.style.removeProperty('--tenant-primary');
    }

    if (branding?.secondary_color) {
      document.documentElement.style.setProperty('--tenant-secondary', branding.secondary_color);
    } else {
      document.documentElement.style.removeProperty('--tenant-secondary');
    }
  }, [branding]);

  return (
    <TenantThemeContext.Provider value={{ branding }}>
      {children}
    </TenantThemeContext.Provider>
  );
}

export const useTenantTheme = () => useContext(TenantThemeContext);
