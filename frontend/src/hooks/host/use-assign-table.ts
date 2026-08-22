import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Reservation } from '@/lib/types/models';
import { ApiResponse } from '@/lib/types/api-responses';
import { toast } from 'sonner';

export interface AssignTablePayload {
  reservationId: string;
  tableId: string;
  version: number; // __v token for OCC
}

export const useAssignTable = (cafeId: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ reservationId, tableId, version }: AssignTablePayload) => {
      const { data } = await axiosInstance.put<ApiResponse<Reservation>>(
        `/api/v1/cafes/${cafeId}/reservations/${reservationId}/table`,
        { table_id: tableId, version }
      );
      return data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      const assignedTable = data?.table_ids?.[0];
      const tableNumber = assignedTable && typeof assignedTable !== 'string' ? assignedTable.table_number : null;
      toast.success(tableNumber ? `Assigned to table T-${tableNumber}` : 'Table assigned');
    },
    onError: (error: any) => {
      if (error?.response?.status === 409) {
        queryClient.invalidateQueries({ queryKey: ['reservations'] });
      }
    },
  });
};
