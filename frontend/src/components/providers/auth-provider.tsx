'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AuthUser } from '@/lib/types/auth';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { useQuery } from '@tanstack/react-query';

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const response = await axiosInstance.get('/api/v1/auth/me');
        return response.data?.data as AuthUser;
      } catch (error) {
        return null;
      }
    },
    retry: false,
  });

  const logout = async () => {
    try {
      await axiosInstance.post('/api/v1/auth/logout');
      await refetch();
    } catch (error) {
      console.error('Logout failed', error);
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
