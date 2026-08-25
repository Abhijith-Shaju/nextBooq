import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { ApiResponse } from '@/lib/types/api-responses';
import { CafeStaffMember } from '@/lib/types/org';

export const useCafeStaff = (cafeId: string, enabled = true) => {
  return useQuery({
    queryKey: ['org', 'cafes', cafeId, 'staff'],
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<CafeStaffMember[]>>(
        `/api/v1/org/cafes/${cafeId}/staff`
      );
      return data.data || [];
    },
    enabled,
    staleTime: 10 * 1000,
    retry: false,
  });
};
