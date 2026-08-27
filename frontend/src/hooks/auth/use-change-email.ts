import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';

export interface ChangeEmailPayload {
  newEmail: string;
  currentPassword: string;
}

interface ChangeEmailResponse {
  message: string;
}

export const useChangeEmail = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ChangeEmailPayload) => {
      const { data } = await axiosInstance.post<ChangeEmailResponse>('/api/v1/auth/change-email', payload);
      return data;
    },
    onSuccess: () => {
      // Server sets pending_email but this endpoint doesn't return the user;
      // refetch /me so the profile page picks up the pending-change state.
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
};
