import axios from 'axios';
import { toast } from 'sonner';
import { QueryClient } from '@tanstack/react-query';
import { getAuthToken, removeAuthToken } from '@/lib/auth-token';

export const queryClient = new QueryClient();

export const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosInstance.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const status = error.response.status;

      switch (status) {
        case 401:
          removeAuthToken();
          queryClient.setQueryData(['me'], null);
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth/')) {
            window.location.href = '/auth/login';
          }
          break;

        case 403:
          toast.error('You do not have permission to perform this action.');
          break;

        case 409:
          toast.error('This table state has changed. Please refresh to see the latest updates.');
          break;

        case 422:
          const validationMsg = error.response.data?.error?.message || 'Invalid input data.';
          toast.error(validationMsg);
          break;

        case 500:
        default:
          if (status >= 500) {
            toast.error('Something went wrong on our end. Please try again.');
          } else {
            toast.error(error.response.data?.error?.message || 'An error occurred.');
          }
          break;
      }
    } else {
      toast.error('Network error. Please check your connection.');
    }
    return Promise.reject(error);
  }
);


