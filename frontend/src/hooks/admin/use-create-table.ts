import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Table, TableZone } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';
import { toast } from 'sonner';

export interface CreateTablePayload {
  table_number: string;
  capacity: number;
  can_merge_with?: string[];
  status?: 'active' | 'out_of_service';
  zone?: TableZone;
}

export const useCreateTable = (cafeId: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateTablePayload) => {
      const { data } = await axiosInstance.post<ApiResponse<Table>>(
        `/api/v1/cafes/${cafeId}/tables`,
        payload
      );
      return data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tables', cafeId] });
      toast.success(`Table ${data?.table_number || ''} created`);
    },
  });
};
