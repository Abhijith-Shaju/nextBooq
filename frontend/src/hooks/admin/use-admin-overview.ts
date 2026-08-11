import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { AdminOverviewStats } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';

export const useAdminOverview = () => {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<AdminOverviewStats>>(
        '/api/v1/platform-admin/overview'
      );
      return data.data;
    },
    staleTime: 60 * 1000,
  });
};
