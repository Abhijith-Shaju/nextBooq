import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { RegisterPayload, AuthUser } from '@/lib/types/auth';
import { ApiResponse } from '@/lib/types/api-responses';
import { setAuthToken } from '@/lib/auth-token';
import { toast } from 'sonner';

export interface RegisterResponse {
  token: string;
  user: AuthUser;
}

export const useRegister = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: RegisterPayload) => {
      const { data } = await axiosInstance.post<ApiResponse<RegisterResponse>>('/api/v1/auth/register', payload);
      const authData = data.data;
      if (authData?.token) {
        setAuthToken(authData.token);
      }
      return authData?.user || (authData as any);
    },
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user);
      queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success('Account created successfully');
    },
  });
};


