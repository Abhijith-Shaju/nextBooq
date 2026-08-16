import { useMutation } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';

interface ResendVerificationEmailResponse {
  message: string;
}

export const useResendVerificationEmail = () => {
  return useMutation({
    mutationFn: async () => {
      const { data } = await axiosInstance.post<ResendVerificationEmailResponse>(
        '/api/v1/auth/resend-verification-email'
      );
      return data;
    },
  });
};
