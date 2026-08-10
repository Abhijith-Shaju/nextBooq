import axios from 'axios';
import { toast } from 'sonner';
import { isDashboardRoute } from '@/lib/route-guard';
import { queryClient } from '@/lib/query-client';

export { queryClient };

// Requests hit this app's own origin (relative baseURL) and are proxied to
// the backend by next.config.ts's rewrite. The session lives in an httpOnly
// cookie set by the backend on login, so the browser attaches it
// automatically via withCredentials — there is no token for this client to
// read or attach itself. See src/lib/session.ts.
export const axiosInstance = axios.create({
  baseURL: '',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const status = error.response.status;

      switch (status) {
        case 401:
          queryClient.setQueryData(['me'], null);
          if (typeof window !== 'undefined') {
            const path = window.location.pathname;
            // Only redirect to staff login if visiting protected staff dashboard
            // routes — shares the same route list the dashboard middleware
            // itself protects (lib/route-guard.ts), so this can't drift stale.
            if (isDashboardRoute(path)) {
              window.location.href = '/auth/login';
            }
          }
          break;

        case 403:
          toast.error('You do not have permission to perform this action.');
          break;

        case 409:
          // TABLE_OCCUPIED carries a structured conflict payload the caller
          // uses to show a specific "seat anyway?" confirmation — the generic
          // toast here would just be noise on top of that.
          if (error.response.data?.error?.code !== 'TABLE_OCCUPIED') {
            toast.error('This table state has changed. Please refresh to see the latest updates.');
          }
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


