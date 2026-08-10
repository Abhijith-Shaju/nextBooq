import { QueryClient } from '@tanstack/react-query';

// Single shared instance used by both the React provider tree
// (query-provider.tsx) and the axios 401 interceptor (axios-instance.ts).
// They must be the same object — an interceptor that clears a *different*
// QueryClient than the one wired into QueryClientProvider silently fails to
// clear the ['me'] cache any component actually reads from.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
});
