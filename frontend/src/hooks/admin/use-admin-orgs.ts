import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { OrgWithCafes } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';

export const useAdminOrgs = () => {
  return useQuery({
    queryKey: ['admin', 'orgs'],
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<OrgWithCafes[]>>(
        '/api/v1/platform-admin/orgs'
      );
      return data.data || [];
    },
    staleTime: 60 * 1000,
  });
};
