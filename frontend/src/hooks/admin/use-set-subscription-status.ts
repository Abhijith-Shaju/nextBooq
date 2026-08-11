import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Subscription, SubscriptionStatus } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';
import { toast } from 'sonner';

export interface SetSubscriptionStatusPayload {
  status: SubscriptionStatus;
  note?: string;
}

export const useSetSubscriptionStatus = (cafeId: string | null) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SetSubscriptionStatusPayload) => {
      const { data } = await axiosInstance.patch<ApiResponse<Subscription>>(
        `/api/v1/platform-admin/cafes/${cafeId}/subscriptions/status`,
        payload
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cafe-subscriptions', cafeId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'orgs'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
      toast.success('Status updated');
    },
  });
};
