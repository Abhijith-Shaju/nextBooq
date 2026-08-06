import axios from 'axios';
import { toast } from 'sonner';

export const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      if (error.response.status === 401) {
        // Handled by AuthProvider/hooks, but we could broadcast an event to clear auth state
      } else if (error.response.status >= 500) {
        toast.error('A server error occurred. Please try again later.');
      } else {
        toast.error(error.response.data?.error?.message || 'An error occurred.');
      }
    } else {
      toast.error('Network error. Please check your connection.');
    }
    return Promise.reject(error);
  }
);
