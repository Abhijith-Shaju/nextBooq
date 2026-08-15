import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { ApiResponse } from '@/lib/types/api-responses';
import { toast } from 'sonner';

export interface AssignStaffPayload {
  email: string;
  role: 'owner' | 'manager' | 'host' | 'staff';
}

interface AssignStaffResult {
  user_id: string;
  email: string;
  cafe_id: string;
  role: string;
}

export const useAssignStaff = (cafeId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: AssignStaffPayload) => {
      const { data } = await axiosInstance.post<ApiResponse<AssignStaffResult>>(
        `/api/v1/org/cafes/${cafeId}/staff`,
        payload
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org', 'cafes'] });
      toast.success('Staff member assigned');
    },
  });
};
