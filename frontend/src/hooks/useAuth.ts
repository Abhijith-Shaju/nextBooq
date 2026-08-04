'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { User } from '@/types';

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading, isError, refetch } = useQuery<User | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const response = await apiClient('/auth/me');
        return response.user || response;
      } catch (err: any) {
        if (err?.status === 401) {
          return null;
        }
        throw err;
      }
    },
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiClient('/auth/logout', { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.setQueryData(['me'], null);
      queryClient.invalidateQueries();
    },
  });

  const hasPermission = (cafeId: string, permission: string): boolean => {
    if (!user) return false;
    if (user.platform_role === 'SUPER_ADMIN') return true;
    const membership = user.staff_memberships?.find((m) => m.cafeId === cafeId);
    if (!membership) return false;
    return membership.permissions?.includes(permission) || membership.role === 'OWNER';
  };

  const isPlatformAdmin = user?.platform_role === 'SUPER_ADMIN' || user?.platform_role === 'SUPPORT';

  return {
    user: user || null,
    isLoading,
    isLoggedIn: !!user,
    isPlatformAdmin,
    hasPermission,
    refetchUser: refetch,
    logout: logoutMutation.mutate,
  };
}
