import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { RegisterPayload, AuthUser } from '@/lib/types/auth';
import { ApiResponse } from '@/lib/types/api-responses';
import { applyAuthResult } from '@/lib/session';
import { toast } from 'sonner';

export interface RegisterResponse {
  token: string;
  user: AuthUser;
}

export const useRegister = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: RegisterPayload) => {
      const { data } = await axiosInstance.post<ApiResponse<RegisterResponse>>('/api/v1/auth/register', payload);
      return applyAuthResult(queryClient, data.data);
    },
    onSuccess: () => {
      toast.success('Account created successfully');
    },
  });
};
