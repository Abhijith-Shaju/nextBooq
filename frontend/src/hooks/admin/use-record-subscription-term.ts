import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Subscription, SubscriptionTermMonths } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';
import { toast } from 'sonner';

export interface RecordSubscriptionTermPayload {
  org_id: string;
  term_months: SubscriptionTermMonths;
  price_per_month: number;
  note?: string;
}

export const useRecordSubscriptionTerm = (cafeId: string | null) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: RecordSubscriptionTermPayload) => {
      const { data } = await axiosInstance.post<ApiResponse<Subscription>>(
        `/api/v1/platform-admin/cafes/${cafeId}/subscriptions`,
        payload
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cafe-subscriptions', cafeId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'orgs'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
      toast.success('Subscription term recorded');
    },
  });
};
