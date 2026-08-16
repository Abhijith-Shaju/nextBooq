import { useMutation } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';

export interface VerifyEmailPayload {
  code: string;
}

interface VerifyEmailResponse {
  message: string;
}

export const useVerifyEmail = () => {
  return useMutation({
    mutationFn: async (payload: VerifyEmailPayload) => {
      const { data } = await axiosInstance.post<VerifyEmailResponse>('/api/v1/auth/verify-email', payload);
      return data;
    },
  });
};
