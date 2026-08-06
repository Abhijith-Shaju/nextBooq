import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Reservation } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';
import { useBookingStore } from '@/store/use-booking-store';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export const useBookTable = (cafeId: string | undefined, slug: string | undefined) => {
  const queryClient = useQueryClient();
  const setReservation = useBookingStore((state) => state.setReservation);
  const router = useRouter();

  return useMutation({
    mutationFn: async (payload: { date: string; time: string; partySize: number }) => {
      const { data } = await axiosInstance.post<ApiResponse<Reservation>>(
        `/api/v1/cafes/${cafeId}/reservations`,
        payload
      );
      return data.data;
    },
    onSuccess: (data) => {
      if (data) {
        setReservation(data);
        toast.success('Table reserved successfully! Redirecting to checkout...');
        router.push(`/${slug}/checkout`);
      }
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error?.message || 'Failed to reserve table');
    },
  });
};
