import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { ReservationDrawer } from './reservation-drawer';
import { useDashboardStore } from '@/store/use-dashboard-store';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Reservation } from '@/lib/types/models';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/api/axios-instance', () => ({
  axiosInstance: { put: vi.fn() },
}));

const reservation: Reservation = {
  id: 'res_1',
  _id: 'res_1',
  cafe_id: 'cafe_1',
  user_id: { _id: 'u1', name: 'Priya Sharma', email: 'priya@test.com', phone: '+919900000000' },
  start_time: '2026-09-05T19:00:00.000Z',
  end_time: '2026-09-05T20:00:00.000Z',
  party_size: 4,
  table_ids: [{ _id: 't1', table_number: '3', capacity: 4 }],
  status: 'CONFIRMED',
  __v: 0,
};

const renderDrawer = () => {
  const queryClient = new QueryClient();
  useDashboardStore.setState({ isDrawerOpen: true, selectedReservationId: 'res_1' });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReservationDrawer cafeId="cafe_1" reservations={[reservation]} />
    </QueryClientProvider>
  );
};

describe('ReservationDrawer table-occupancy conflict on seating', () => {
  beforeEach(() => {
    useDashboardStore.setState({ isDrawerOpen: false, selectedReservationId: null });
    vi.mocked(axiosInstance.put).mockReset();
  });

  test('shows a conflict confirmation instead of failing silently when the table is occupied', async () => {
    vi.mocked(axiosInstance.put).mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: { code: 'TABLE_OCCUPIED', message: 'Table is currently occupied by Grace Hopper' },
          conflict: { reservationId: 'res_other', guestName: 'Grace Hopper', tableNumbers: ['3'], seatedAt: null },
        },
      },
    });

    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: /seat guest at table/i }));

    await waitFor(() => expect(screen.getByText(/grace hopper/i)).toBeInTheDocument());
    expect(axiosInstance.put).toHaveBeenCalledTimes(1);
    expect(vi.mocked(axiosInstance.put).mock.calls[0][1]).toMatchObject({ status: 'SEATED', force: false });
  });

  test('confirming the conflict dialog retries the seat request with force:true', async () => {
    vi.mocked(axiosInstance.put)
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: {
            error: { code: 'TABLE_OCCUPIED', message: 'occupied' },
            conflict: { reservationId: 'res_other', guestName: 'Grace Hopper', tableNumbers: ['3'], seatedAt: null },
          },
        },
      })
      .mockResolvedValueOnce({ data: { data: { ...reservation, status: 'SEATED' } } });

    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: /seat guest at table/i }));

    await waitFor(() => expect(screen.getByText(/grace hopper/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /seat anyway/i }));

    await waitFor(() => expect(axiosInstance.put).toHaveBeenCalledTimes(2));
    expect(vi.mocked(axiosInstance.put).mock.calls[1][1]).toMatchObject({ status: 'SEATED', force: true });
  });
});
