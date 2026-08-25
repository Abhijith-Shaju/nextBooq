import { useMutation } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';

interface ResendVerificationEmailResponse {
  message: string;
}

export const useResendVerificationEmail = () => {
  return useMutation({
    mutationFn: async () => {
      const { data } = await axiosInstance.post<ResendVerificationEmailResponse>(
        '/api/v1/auth/resend-verification-email',
        undefined,
        // The caller (email-verification-banner.tsx) shows its own
        // success/error toast wording for this specific action, so the
        // generic interceptor toast would otherwise stack on top (L-07).
        { skipGlobalErrorToast: true }
      );
      return data;
    },
  });
};
