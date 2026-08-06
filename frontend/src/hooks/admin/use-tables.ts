import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Table } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';

export const useTables = (cafeId: string | undefined) => {
  return useQuery({
    queryKey: ['tables', cafeId],
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<Table[]>>(`/api/v1/cafes/${cafeId}/tables`);
      return data.data || [];
    },
    enabled: !!cafeId,
    staleTime: 5 * 60 * 1000,
  });
};
