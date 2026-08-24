import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { ApiResponse } from '@/lib/types/api-responses';
import { ReservationCafeRef, ReservationUserRef } from '@/lib/types/models';

export interface FlaggedRefundReservation {
  _id: string;
  cafe_id: ReservationCafeRef;
  user_id: ReservationUserRef;
  status: string;
  party_size: number;
  payment_data: {
    order_id: string | null;
    amount: number;
    currency: string;
    status: string;
  };
  updated_at: string;
}

export const useRefundsNeeded = () => {
  return useQuery({
    queryKey: ['admin', 'refunds-needed'],
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<FlaggedRefundReservation[]>>(
        '/api/v1/platform-admin/refunds-needed'
      );
      return data.data || [];
    },
    staleTime: 60 * 1000,
  });
};
