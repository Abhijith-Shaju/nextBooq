import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import type { ApiResponse } from '@/lib/types/api-responses';
import type { OwnerLookupResult } from '@/lib/types/admin-onboarding';

export function useOwnerLookup(email: string, enabled: boolean) {
  const normalizedEmail = email.trim().toLowerCase();
  return useQuery({
    queryKey: ['admin', 'owner-lookup', normalizedEmail],
    enabled: enabled && normalizedEmail.length > 0,
    retry: false,
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<{ user: OwnerLookupResult }>>(
        `/api/v1/platform-admin/users/lookup?email=${encodeURIComponent(normalizedEmail)}`,
      );
      if (!data.data?.user) throw new Error('Owner lookup returned no user');
      return data.data.user;
    },
  });
}
