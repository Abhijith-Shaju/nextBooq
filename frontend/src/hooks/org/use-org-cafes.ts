import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { ApiResponse } from '@/lib/types/api-responses';
import { OrgCafe } from '@/lib/types/org';

export const useOrgCafes = (enabled = true) => {
  return useQuery({
    queryKey: ['org', 'cafes'],
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<OrgCafe[]>>('/api/v1/org/cafes');
      return data.data || [];
    },
    enabled,
    staleTime: 30 * 1000,
    retry: false,
  });
};
