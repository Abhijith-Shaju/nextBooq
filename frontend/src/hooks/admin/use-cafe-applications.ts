import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import type { ApiResponse } from '@/lib/types/api-responses';
import type { CafeApplicationDetail, CafeApplicationStatus } from '@/lib/types/cafe-application';

// The list endpoint returns the same shape as the detail endpoint (backend's
// withApplicant() builds both from the same helper — see
// cafeApplicationService.js), so the list view has the address/applicant
// fields available too, not just the bare summary.
export const useCafeApplications = (status?: CafeApplicationStatus) => {
  return useQuery({
    queryKey: ['admin', 'cafe-applications', status],
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<CafeApplicationDetail[]>>(
        '/api/v1/platform-admin/cafe-applications',
        { params: status ? { status } : undefined }
      );
      return data.data || [];
    },
    staleTime: 30 * 1000,
  });
};

export const useCafeApplication = (id: string) => {
  return useQuery({
    queryKey: ['admin', 'cafe-applications', id],
    queryFn: async () => {
      const { data } = await axiosInstance.get<ApiResponse<CafeApplicationDetail>>(
        `/api/v1/platform-admin/cafe-applications/${id}`
      );
      return data.data || null;
    },
    enabled: !!id,
    staleTime: 30 * 1000,
  });
};
