import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Table, TableZone } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';
import { toast } from 'sonner';

interface EditTableResponse extends ApiResponse<Table> {
  // Present only when a zone/floor change invalidated existing merge links;
  // carries the table_numbers whose links were dropped.
  dropped_merge_partners?: string[];
}

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
      const { data } = await axiosInstance.put<EditTableResponse>(
        `/api/v1/cafes/${cafeId}/tables/${tableId}`,
        payload
      );
      return data;
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['tables', cafeId] });

      // Moving a table to another zone or floor strands merge partners left
      // behind in the old section, and the server drops those links. Say so —
      // otherwise the host finds the merge quietly gone later.
      const dropped = response.dropped_merge_partners;
      if (dropped && dropped.length > 0) {
        toast.success(
          `Table updated. Merge with ${dropped.map((n) => `T-${n}`).join(', ')} removed — a table can only merge within its own zone and floor.`
        );
        return;
      }

      toast.success('Table updated successfully');
    },
  });
};
