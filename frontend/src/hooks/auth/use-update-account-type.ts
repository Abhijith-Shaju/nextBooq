import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { ApiResponse } from '@/lib/types/api-responses';
import { User } from '@/lib/types/models';

export interface UpdateAccountTypePayload {
  account_type: 'customer' | 'cafe_owner';
}

export const useUpdateAccountType = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateAccountTypePayload) => {
      const { data } = await axiosInstance.patch<ApiResponse<User>>('/api/v1/auth/account-type', payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
};
