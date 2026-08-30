import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';

export const useWithdrawCafeApplication = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await axiosInstance.delete('/api/v1/cafe-applications/mine');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cafe-application', 'mine'] });
    },
  });
};
