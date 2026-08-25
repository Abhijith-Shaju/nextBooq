'use client';

import { createContext, useContext, ReactNode } from 'react';
import { AuthUser } from '@/lib/types/auth';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useBookingStore } from '@/store/use-booking-store';
import { useDashboardStore } from '@/store/use-dashboard-store';
import { useMe } from '@/hooks/auth/use-me';

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  // Where to send the user after logging out. Defaults to the staff/admin
  // login page; a caller inside a tenant's storefront (e.g.
  // TenantPublicHeader) passes the storefront path instead, since a
  // customer logging out has no reason to land on the staff login screen.
  logout: (redirectTo?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading } = useMe();

  const logout = async (redirectTo: string = '/auth/login') => {
    try {
      await axiosInstance.post('/api/v1/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      queryClient.setQueryData(['me'], null);
      queryClient.invalidateQueries({ queryKey: ['me'] });
      // Clear any in-progress booking/dashboard UI state — a second person
      // signing in on the same shared browser tab shouldn't inherit it.
      useBookingStore.getState().resetBooking();
      useDashboardStore.getState().reset();
      toast.success('Signed out successfully');
      router.push(redirectTo);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user: data || null,
        isAuthenticated: !!data,
        isLoading,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

