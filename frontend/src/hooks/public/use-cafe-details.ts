import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Cafe } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';

export const useCafeDetails = (slug: string) => {
  return useQuery({
    queryKey: ['cafe', slug],
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<Cafe>>(`/api/v1/cafes/slug/${slug}`);
      return data.data;
    },
    staleTime: 1000 * 60 * 60, // 1 hour per standards
    gcTime: 1000 * 60 * 60 * 2,
    enabled: !!slug,
  });
};

