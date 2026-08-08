'use client';

import { createContext, useContext, ReactNode } from 'react';
import { AuthUser } from '@/lib/types/auth';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clearSession } from '@/lib/session';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const response = await axiosInstance.get('/api/v1/auth/me');
        return response.data?.data as AuthUser;
      } catch (error) {
        clearSession();
        return null;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const logout = async () => {
    try {
      await axiosInstance.post('/api/v1/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearSession();
      queryClient.setQueryData(['me'], null);
      queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success('Signed out successfully');
      router.push('/auth/login');
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

