import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Reservation, ReservationStatus } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';
import { toast } from 'sonner';

export interface UpdateStatusPayload {
  reservationId: string;
  status: ReservationStatus;
  version: number; // __v token for OCC
}

export const useUpdateStatus = (cafeId: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ reservationId, status, version }: UpdateStatusPayload) => {
      const { data } = await axiosInstance.put<ApiResponse<Reservation>>(
        `/api/v1/cafes/${cafeId}/reservations/${reservationId}/status`,
        {
          status,
          version,
        }
      );
      return data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      toast.success(`Reservation status updated to ${data?.status || 'new status'}`);
    },
    onError: (error: any) => {
      if (error?.response?.status === 409) {
        queryClient.invalidateQueries({ queryKey: ['reservations'] });
      }
    },
  });
};
