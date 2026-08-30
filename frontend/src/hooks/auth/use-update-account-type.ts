import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';

export interface UpdateAccountTypePayload {
  account_type: 'customer' | 'cafe_owner';
}

export const useUpdateAccountType = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateAccountTypePayload) => {
      const { data } = await axiosInstance.patch('/api/v1/auth/account-type', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
};
