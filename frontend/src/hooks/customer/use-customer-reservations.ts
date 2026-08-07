import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Reservation } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';

export const useCustomerReservations = (enabled = true) => {
  return useQuery({
    queryKey: ['customer-reservations'],
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<Reservation[]>>(
        '/api/v1/customer/reservations'
      );
      return data.data || [];
    },
    enabled,
  });
};
