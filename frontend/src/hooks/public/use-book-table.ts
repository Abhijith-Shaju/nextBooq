import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Reservation } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';
import { useBookingStore } from '@/store/use-booking-store';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export interface BookTablePayload {
  start_time: string; // ISO 8601 UTC String
  party_size: number;
  duration_minutes?: number;
}

export interface HoldReservationResponse {
  reservation_id: string;
  status: string;
  razorpay_order_id: string;
  amount: number;
  currency: string;
  hold_expires_at: string;
}

export const useBookTable = (cafeId: string | undefined, slug: string | undefined) => {
  const queryClient = useQueryClient();
  const setReservation = useBookingStore((state) => state.setReservation);
  const setHoldExpiresAt = useBookingStore((state) => state.setHoldExpiresAt);
  const router = useRouter();

  return useMutation({
    mutationFn: async (payload: BookTablePayload) => {
      const { data } = await axiosInstance.post<ApiResponse<HoldReservationResponse>>(
        `/api/v1/cafes/${cafeId}/reservations`,
        payload
      );
      return data.data;
    },
    onSuccess: (data) => {
      if (data) {
        setReservation({
          id: data.reservation_id,
          status: data.status,
          razorpay_order_id: data.razorpay_order_id,
          amount: data.amount,
          currency: data.currency,
          hold_expires_at: data.hold_expires_at,
        });
        if (data.hold_expires_at) {
          setHoldExpiresAt(new Date(data.hold_expires_at));
        }
        queryClient.invalidateQueries({ queryKey: ['availability'] });
        toast.success('Hold created! Redirecting to checkout...');
        if (slug) {
          router.push(`/${slug}/checkout?reservation_id=${data.reservation_id}`);
        }
      }
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error?.message || 'Failed to reserve table');
    },
  });
};

