import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { ApiResponse } from '@/lib/types/api-responses';
import { toast } from 'sonner';

export interface CancelReservationResult {
  _id: string;
  status: string;
  /**
   * Whether the cafe owes the fee back, and if not, why. Decided by the server
   * from the terms snapshotted on the booking and the notice given —
   * deliberately not recomputed here, because a second copy of that rule would
   * eventually tell a guest something the cafe's refunds queue disagreed with.
   */
  refund_due: boolean;
  fee_paid: boolean;
  refund_withheld_reason: null | 'late' | 'non_refundable';
  cutoff_hours: number;
  amount: number;
  currency: string;
}

const formatAmount = (amount: number, currency: string) =>
  `${currency === 'INR' ? '₹' : `${currency} `}${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;

/**
 * What to tell the guest about their money.
 *
 * Three outcomes, not two. Saying only "Booking cancelled" to someone who paid
 * a fee and is getting nothing back leaves them to conclude the app kept it —
 * and the confirm dialog has just told them the answer "depends on the cafe's
 * terms", so going quiet is refusing to answer a question we raised.
 */
export const describeCancellation = (result: CancelReservationResult | undefined): string => {
  if (!result) return 'Booking cancelled.';

  const money = formatAmount(result.amount, result.currency);

  if (result.refund_due) {
    // Not "the cafe will refund you" — nextBooq cannot make that happen. The
    // cafe issues it from its own account, which is what the refund policy
    // says and what the refunds queue actually does.
    return `Booking cancelled. ${money} is due back to you — the cafe issues refunds from its own account, usually within 5–7 business days.`;
  }

  if (result.refund_withheld_reason === 'late') {
    return `Booking cancelled. The ${money} fee is not refunded — the cafe asks for ${result.cutoff_hours} hours' notice.`;
  }

  if (result.refund_withheld_reason === 'non_refundable') {
    return `Booking cancelled. The ${money} fee is not refunded — this booking was taken on non-refundable terms.`;
  }

  return 'Booking cancelled.';
};

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
      // Long enough to read, because for a guest who is not getting their fee
      // back this is the explanation, and the email is the only other copy.
      toast.success(describeCancellation(result), { duration: 8000 });
    },
  });
};
