import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { AuthUser } from '@/lib/types/auth';
import { ApiResponse } from '@/lib/types/api-responses';
import { applyAuthResult } from '@/lib/session';

export interface CustomerQuickAuthPayload {
  name: string;
  email: string;
  phone: string;
  password: string;
}

export interface CustomerQuickAuthResponse {
  token: string;
  user: AuthUser;
}

export const useCustomerQuickAuth = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CustomerQuickAuthPayload) => {
      const { data } = await axiosInstance.post<ApiResponse<CustomerQuickAuthResponse>>(
        '/api/v1/auth/customer-quick-auth',
        payload
      );
      return applyAuthResult(queryClient, data.data);
    },
  });
};
