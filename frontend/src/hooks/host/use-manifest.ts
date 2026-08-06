import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Reservation } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';

export const useManifest = (cafeId: string | undefined, date: string | undefined) => {
  return useQuery({
    queryKey: ['reservations', cafeId, date],
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<Reservation[]>>(
        `/api/v1/cafes/${cafeId}/reservations`,
        {
          params: { date },
        }
      );
      return data.data || [];
    },
    enabled: !!cafeId,
    staleTime: 0, // Fresh data required for host stand manifest
  });
};
