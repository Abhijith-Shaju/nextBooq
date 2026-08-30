import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { ApiResponse } from '@/lib/types/api-responses';
import { CafeApplicationSummary } from '@/lib/types/cafe-application';

export const useMyCafeApplication = (enabled = true) =>
  useQuery({
    queryKey: ['cafe-application', 'mine'],
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<CafeApplicationSummary | null>>(
        '/api/v1/cafe-applications/mine'
      );
      return data.data || null;
    },
    enabled,
    staleTime: 30 * 1000,
    retry: false,
  });
