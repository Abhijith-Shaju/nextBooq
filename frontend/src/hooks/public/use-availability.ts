import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { AvailableSlot } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';
import { format } from 'date-fns';

export const useAvailability = (cafeId: string | undefined, date: Date | string | null, partySize: number) => {
  const dateStr = date instanceof Date ? format(date, 'yyyy-MM-dd') : date;

  return useQuery({
    queryKey: ['availability', cafeId, dateStr, partySize],
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<AvailableSlot[]>>(`/api/v1/cafes/${cafeId}/available-slots`, {
        params: {
          date: dateStr,
          partySize,
        },
      });
      return data.data || [];
    },
    enabled: !!cafeId && !!dateStr && partySize > 0,
    staleTime: 0, // Fresh availability data required
  });
};

