'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { AvailableSlot } from '@/types';

export function useAvailability(cafeId: string | undefined, date: string, partySize: number) {
  return useQuery<{ available_slots: AvailableSlot[] }>({
    queryKey: ['availability', cafeId, date, partySize],
    queryFn: async () => {
      if (!cafeId) return { available_slots: [] };
      return apiClient(`/cafes/${cafeId}/available-slots?date=${date}&partySize=${partySize}`);
    },
    enabled: !!cafeId && !!date && partySize > 0,
    staleTime: 1000 * 30, // 30 seconds
  });
}
