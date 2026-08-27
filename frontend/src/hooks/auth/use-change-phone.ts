import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';

export interface ChangePhonePayload {
  newPhone: string;
  currentPassword: string;
}

interface ChangePhoneResponse {
  message: string;
  data: { phone: string };
}

export const useChangePhone = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ChangePhonePayload) => {
      const { data } = await axiosInstance.post<ChangePhoneResponse>('/api/v1/auth/change-phone', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
};
