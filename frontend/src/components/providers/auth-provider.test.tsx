import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { AuthProvider, useAuth } from './auth-provider';
import { useBookingStore } from '@/store/use-booking-store';
import { useDashboardStore } from '@/store/use-dashboard-store';
import { axiosInstance } from '@/hooks/api/axios-instance';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/api/axios-instance', () => ({
  axiosInstance: { get: vi.fn(), post: vi.fn() },
}));

const LogoutButton = () => {
  const { logout } = useAuth();
  return <button onClick={() => logout()}>Sign out</button>;
};

describe('AuthProvider logout clears per-tenant client state', () => {
  beforeEach(() => {
    useBookingStore.getState().resetBooking();
    useDashboardStore.getState().reset();
    vi.mocked(axiosInstance.get).mockResolvedValue({ data: { data: null } });
    vi.mocked(axiosInstance.post).mockResolvedValue({});
  });

  test('logging out resets the booking and dashboard stores', async () => {
    useBookingStore.getState().setPartySize(6);
    useDashboardStore.getState().openDrawer('res_123');

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LogoutButton />
        </AuthProvider>
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledWith('/api/v1/auth/logout'));

    expect(useBookingStore.getState().partySize).toBe(2);
    expect(useDashboardStore.getState().isDrawerOpen).toBe(false);
  });
});
