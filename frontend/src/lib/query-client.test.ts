import { describe, test, expect } from 'vitest';
import { queryClient as sharedQueryClient } from './query-client';
import { queryClient as axiosInterceptorQueryClient } from '@/hooks/api/axios-instance';

describe('shared QueryClient singleton', () => {
  test('the axios 401 interceptor uses the exact same QueryClient instance as the app provider', () => {
    expect(axiosInterceptorQueryClient).toBe(sharedQueryClient);
  });
});
