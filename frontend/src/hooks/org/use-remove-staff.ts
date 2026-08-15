import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { toast } from 'sonner';

export const useRemoveStaff = (cafeId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      await axiosInstance.delete(`/api/v1/org/cafes/${cafeId}/staff/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org', 'cafes'] });
      toast.success('Staff member removed');
    },
  });
};
