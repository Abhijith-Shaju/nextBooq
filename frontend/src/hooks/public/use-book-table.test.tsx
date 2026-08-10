import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useBookTable } from './use-book-table';
import { useBookingStore } from '@/store/use-booking-store';
import { axiosInstance } from '@/hooks/api/axios-instance';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/api/axios-instance', () => ({
  axiosInstance: { post: vi.fn() },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

describe('useBookTable', () => {
  beforeEach(() => {
    useBookingStore.getState().resetBooking();
    vi.mocked(axiosInstance.post).mockReset();
  });

  test('populates the booking store with the hold reservation on success', async () => {
    const holdResponse = {
      reservation_id: 'res_123',
      status: 'PENDING_PAYMENT',
      razorpay_order_id: 'order_abc',
      amount: 10000,
      currency: 'INR',
      hold_expires_at: '2026-08-20T19:10:00Z',
    };
    vi.mocked(axiosInstance.post).mockResolvedValue({ data: { data: holdResponse } });

    const { result } = renderHook(() => useBookTable('cafe_1', 'demo-cafe'), { wrapper });

    result.current.mutate({ start_time: '2026-08-20T19:00:00Z', party_size: 2 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const storeReservation = useBookingStore.getState().reservation;
    expect(storeReservation).toEqual({
      id: 'res_123',
      status: 'PENDING_PAYMENT',
      razorpay_order_id: 'order_abc',
      amount: 10000,
      currency: 'INR',
      hold_expires_at: '2026-08-20T19:10:00Z',
    });
  });
});
