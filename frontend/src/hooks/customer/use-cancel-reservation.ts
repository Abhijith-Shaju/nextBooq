import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { ApiResponse } from '@/lib/types/api-responses';
import { toast } from 'sonner';

export interface CancelReservationResult {
  _id: string;
  status: string;
  /**
   * Whether the cafe owes the fee back. Decided by the server from the terms
   * snapshotted on the booking and how much notice was given — deliberately
   * not recomputed here, because a second copy of that rule would eventually
   * tell a guest something the cafe's queue disagrees with.
   */
  refund_due: boolean;
}

export const useCancelReservation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reservationId: string) => {
      const { data } = await axiosInstance.post<ApiResponse<CancelReservationResult>>(
        `/api/v1/customer/reservations/${reservationId}/cancel`,
        {},
        // The dialog shows the failure in place, next to the booking being
        // cancelled; the global toast would duplicate it.
        { skipGlobalErrorToast: true }
      );
      return data.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['customer-reservations'] });
      toast.success(
        result?.refund_due
          ? 'Booking cancelled. The cafe will refund your reservation fee.'
          : 'Booking cancelled.'
      );
    },
  });
};
