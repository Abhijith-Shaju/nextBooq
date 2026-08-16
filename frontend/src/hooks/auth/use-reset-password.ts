import { useMutation } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';

export interface ResetPasswordPayload {
  token: string;
  password: string;
}

interface ResetPasswordResponse {
  message: string;
}

export const useResetPassword = () => {
  return useMutation({
    mutationFn: async (payload: ResetPasswordPayload) => {
      const { data } = await axiosInstance.post<ResetPasswordResponse>('/api/v1/auth/reset-password', payload);
      return data;
    },
  });
};
