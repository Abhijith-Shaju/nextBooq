import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import type { ApiResponse } from '@/lib/types/api-responses';
import type { ProvisionCafePayload, ProvisionCafeResult } from '@/lib/types/admin-onboarding';

export function useProvisionCafe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ProvisionCafePayload) => {
      const { data } = await axiosInstance.post<ApiResponse<ProvisionCafeResult>>('/api/v1/platform-admin/cafes', payload);
      if (!data.data) throw new Error('Provisioning returned no result');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'orgs'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'owner-lookup'] });
    },
  });
}
