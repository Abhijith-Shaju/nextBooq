import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { ApiResponse } from '@/lib/types/api-responses';
import { toast } from 'sonner';

/**
 * One entry in a cafe's refunds-owed queue: a guest who is owed their
 * reservation fee back and has not been paid yet.
 */
export interface RefundOwed {
  _id: string;
  status: string;
  start_time: string;
  party_size: number;
  guest?: { _id?: string; name?: string; email?: string; phone?: string } | string | null;
  amount: number;
  currency: string;
  payment_id: string | null;
  cancelled_at: string | null;
}

/** A refund the cafe has already paid, kept so it can be evidenced later. */
export interface RefundSettled {
  _id: string;
  status: string;
  start_time: string;
  guest?: { _id?: string; name?: string; email?: string; phone?: string } | string | null;
  amount: number;
  currency: string;
  payment_id: string | null;
  refund_reference: string | null;
  refund_settled_at: string | null;
}

export const refundsOwedQueryKey = (cafeId: string | undefined) => ['refunds-owed', cafeId];
export const refundsSettledQueryKey = (cafeId: string | undefined) => ['refunds-settled', cafeId];

/**
 * `enabled` is left to the caller rather than defaulted to `!!cafeId`: the
 * sidebar badge must not fire this for a staff member without
 * view_reservations, who would get a 403 and a toast on every dashboard page.
 */
export const useRefundsOwed = (cafeId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: refundsOwedQueryKey(cafeId),
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<RefundOwed[]>>(
        `/api/v1/cafes/${cafeId}/refunds-owed`
      );
      return data.data || [];
    },
    enabled: !!cafeId && enabled,
  });

/**
 * Only fetched when the settled tab is actually opened -- the owed queue is
 * the working view, and this is history nobody needs loaded by default.
 */
export const useRefundsSettled = (cafeId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: refundsSettledQueryKey(cafeId),
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<RefundSettled[]>>(
        `/api/v1/cafes/${cafeId}/refunds-settled`
      );
      return data.data || [];
    },
    enabled: !!cafeId && enabled,
  });

export const useMarkRefundSettled = (cafeId: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reservationId,
      refundReference,
    }: {
      reservationId: string;
      refundReference: string;
    }) => {
      const { data } = await axiosInstance.put(
        `/api/v1/cafes/${cafeId}/reservations/${reservationId}/refund-settled`,
        { refund_reference: refundReference },
        // The dialog surfaces the failure inline, next to the field the user
        // has to correct; the global interceptor's toast would duplicate it.
        { skipGlobalErrorToast: true }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: refundsOwedQueryKey(cafeId) });
      // The entry moves from one tab to the other, so the history is stale too.
      queryClient.invalidateQueries({ queryKey: refundsSettledQueryKey(cafeId) });
      toast.success('Refund recorded');
    },
  });
};
