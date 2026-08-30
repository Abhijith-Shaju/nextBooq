import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import type { ApiResponse } from '@/lib/types/api-responses';
import type { ProvisionCafeResult } from '@/lib/types/admin-onboarding';
import type { ProvisionSubscription } from '@/lib/types/admin-onboarding';
import type { CafeApplicationSummary } from '@/lib/types/cafe-application';

export interface ApproveCafeApplicationResult {
  application: CafeApplicationSummary;
  provisioned: ProvisionCafeResult;
}

export const useApproveCafeApplication = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, subscription }: { id: string; subscription: ProvisionSubscription }) => {
      const { data } = await axiosInstance.post<ApiResponse<ApproveCafeApplicationResult>>(
        `/api/v1/platform-admin/cafe-applications/${id}/approve`,
        { subscription }
      );
      return data.data as ApproveCafeApplicationResult;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'cafe-applications'] }),
  });
};

export const useRejectCafeApplication = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { data } = await axiosInstance.post<ApiResponse<CafeApplicationSummary>>(
        `/api/v1/platform-admin/cafe-applications/${id}/reject`,
        { note }
      );
      return data.data as CafeApplicationSummary;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'cafe-applications'] }),
  });
};
