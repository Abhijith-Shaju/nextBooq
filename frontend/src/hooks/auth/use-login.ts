import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { LoginPayload, AuthUser } from '@/lib/types/auth';
import { ApiResponse } from '@/lib/types/api-responses';
import { toast } from 'sonner';

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export const useLogin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: LoginPayload) => {
      const { data } = await axiosInstance.post<ApiResponse<LoginResponse>>('/api/v1/auth/login', payload);
      return data.data?.user || (data.data as any);
    },
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user);
      queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success('Logged in successfully');
    },
  });
};

