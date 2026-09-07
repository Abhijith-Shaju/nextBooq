import { useMutation } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';

export interface ForgotPasswordPayload {
  email: string;
  /**
   * Slug of the cafe storefront the guest was on, so the reset email can send
   * them back there instead of stranding them on the operator login page.
   * A slug rather than a URL on purpose: the server validates it against a
   * real cafe, so this cannot be used to put an arbitrary link into an email
   * nextBooq sends on someone else's behalf.
   */
  cafe_slug?: string;
}

interface ForgotPasswordResponse {
  message: string;
}

export const useForgotPassword = () => {
  return useMutation({
    mutationFn: async (payload: ForgotPasswordPayload) => {
      const { data } = await axiosInstance.post<ForgotPasswordResponse>('/api/v1/auth/forgot-password', payload);
      return data;
    },
  });
};
