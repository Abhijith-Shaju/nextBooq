import { useMutation } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';

interface RequestStepUpOtpResponse {
  message: string;
}

export const useRequestStepUpOtp = () => {
  return useMutation({
    mutationFn: async () => {
      const { data } = await axiosInstance.post<RequestStepUpOtpResponse>('/api/v1/auth/request-step-up-otp');
      return data;
    },
  });
};
