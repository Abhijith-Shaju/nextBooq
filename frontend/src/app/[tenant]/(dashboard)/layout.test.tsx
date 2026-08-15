import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TenantDashboardLayout from './layout';

const replaceMock = vi.fn();
const socketMock = { on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };

vi.mock('next/navigation', () => ({
  usePathname: () => '/garden-cafe/reservations',
  useSearchParams: () => new URLSearchParams('date=2026-08-15'),
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('socket.io-client', () => ({ io: vi.fn(() => socketMock) }));
vi.mock('@/hooks/api/axios-instance', () => ({ axiosInstance: { get: vi.fn().mockRejectedValue(new Error('not authenticated')) } }));
vi.mock('@/components/providers/tenant-provider', () => ({
  useTenant: () => ({ cafe: { id: 'cafe-1', name: 'Garden Cafe', slug: 'garden-cafe' } }),
}));

const useAuthMock = vi.fn();
vi.mock('@/components/providers/auth-provider', () => ({ useAuth: () => useAuthMock() }));

function renderLayout() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><TenantDashboardLayout>children</TenantDashboardLayout></QueryClientProvider>);
}

describe('TenantDashboardLayout', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    useAuthMock.mockReturnValue({ user: null, isLoading: false, logout: vi.fn() });
  });

  test('preserves the tenant destination when redirecting an unauthenticated visitor to login', async () => {
    renderLayout();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/auth/login?callbackUrl=%2Fgarden-cafe%2Freservations%3Fdate%3D2026-08-15'));
  });
});
