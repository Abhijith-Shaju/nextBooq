import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { ApiResponse } from '@/lib/types/api-responses';
import { CafeApplicationPayload, CafeApplicationSummary } from '@/lib/types/cafe-application';

export const useSubmitCafeApplication = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CafeApplicationPayload) => {
      const { data } = await axiosInstance.post<ApiResponse<CafeApplicationSummary>>(
        '/api/v1/cafe-applications',
        payload
      );
      return data.data as CafeApplicationSummary;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cafe-application', 'mine'] });
    },
  });
};
