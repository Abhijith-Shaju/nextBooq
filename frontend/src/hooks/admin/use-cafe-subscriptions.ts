import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Subscription } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';

export const useCafeSubscriptions = (cafeId: string | null) => {
  return useQuery({
    queryKey: ['admin', 'cafe-subscriptions', cafeId],
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<Subscription[]>>(
        `/api/v1/platform-admin/cafes/${cafeId}/subscriptions`
      );
      return data.data || [];
    },
    enabled: !!cafeId,
  });
};
