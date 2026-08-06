import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Cafe, ReservationRules } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';
import { toast } from 'sonner';

export interface CreateCafePayload {
  org_name: string;
  cafe_name: string;
  slug: string;
  timezone?: string;
  reservation_rules?: Partial<ReservationRules>;
}

export const useCreateCafe = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateCafePayload) => {
      const { data } = await axiosInstance.post<ApiResponse<Cafe>>('/api/v1/cafes', payload);
      return data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success(`Cafe "${data?.name}" created successfully!`);
    },
  });
};
