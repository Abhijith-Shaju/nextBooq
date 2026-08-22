import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { ApiResponse } from '@/lib/types/api-responses';
import { Organization } from '@/lib/types/org';

export const useOrganization = (enabled = true) => {
  return useQuery({
    queryKey: ['org'],
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<Organization>>('/api/v1/org');
      return data.data || null;
    },
    enabled,
    staleTime: 30 * 1000,
    retry: false,
  });
};
