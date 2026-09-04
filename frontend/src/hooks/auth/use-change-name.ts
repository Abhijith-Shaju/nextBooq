import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';

export interface ChangeNamePayload {
  name: string;
}

interface ChangeNameResponse {
  data: { name: string };
}

/**
 * Corrects the signed-in user's own display name.
 *
 * Unlike changing an email or phone, this asks for no password: a display name
 * is neither a login identifier nor a uniqueness constraint, and the DPDP
 * right of correction is meant to be easy to exercise, not gated behind a
 * re-authentication prompt.
 */
export const useChangeName = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ChangeNamePayload) => {
      const { data } = await axiosInstance.patch<ChangeNameResponse>('/api/v1/auth/name', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
};
