import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Table, TableZone } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';
import { toast } from 'sonner';

export interface EditTablePayload {
  tableId: string;
  table_number?: string;
  capacity?: number;
  can_merge_with?: string[];
  status?: 'active' | 'out_of_service';
  zone?: TableZone;
  floor?: number;
  is_deleted?: boolean;
}

export const useEditTable = (cafeId: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tableId, ...payload }: EditTablePayload) => {
      const { data } = await axiosInstance.put<ApiResponse<Table>>(
        `/api/v1/cafes/${cafeId}/tables/${tableId}`,
        payload
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', cafeId] });
      toast.success('Table updated successfully');
    },
  });
};
