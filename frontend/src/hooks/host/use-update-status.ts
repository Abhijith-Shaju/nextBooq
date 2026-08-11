import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Reservation, ReservationStatus } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';
import { toast } from 'sonner';

export interface UpdateStatusPayload {
  reservationId: string;
  status: ReservationStatus;
  version: number; // __v token for OCC
  // Bypasses the backend's table-occupancy warning when seating a
  // reservation onto a table another party is currently SEATED at — set
  // after the host confirms an occupancy-conflict dialog.
  force?: boolean;
  // Moves this reservation to a free table the backend picks, instead of
  // force-seating onto the occupied one. Mutually exclusive with `force`.
  reassign?: boolean;
}

export const useUpdateStatus = (cafeId: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ reservationId, status, version, force, reassign }: UpdateStatusPayload) => {
      const { data } = await axiosInstance.put<ApiResponse<Reservation>>(
        `/api/v1/cafes/${cafeId}/reservations/${reservationId}/status`,
        {
          status,
          version,
          force,
          reassign,
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
