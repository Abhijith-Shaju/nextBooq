import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { AuthUser } from '@/lib/types/auth';
import { ApiResponse } from '@/lib/types/api-responses';

export const useMe = () => {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const { data } = await axiosInstance.get<ApiResponse<AuthUser>>('/api/v1/auth/me');
        return data.data || null;
      } catch (error: any) {
        if (error?.response?.status === 401) {
          return null;
        }
        throw error;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
};
