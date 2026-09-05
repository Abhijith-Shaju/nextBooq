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

  test('offers a Reassign option when the backend suggests a free alternate table', async () => {
    vi.mocked(axiosInstance.put).mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: { code: 'TABLE_OCCUPIED', message: 'occupied' },
          conflict: { reservationId: 'res_other', guestName: 'Grace Hopper', tableNumbers: ['3'], seatedAt: null },
          alternate: { tableNumbers: ['7'], totalCapacity: 4 },
        },
      },
    });

    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: /seat guest at table/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^reassign$/i })).toBeInTheDocument()
    );
  });

  test('hides the Reassign option when the backend suggests no alternate', async () => {
    vi.mocked(axiosInstance.put).mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: { code: 'TABLE_OCCUPIED', message: 'occupied' },
          conflict: { reservationId: 'res_other', guestName: 'Grace Hopper', tableNumbers: ['3'], seatedAt: null },
        },
      },
    });

    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: /seat guest at table/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /seat anyway/i })).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: /^reassign$/i })).not.toBeInTheDocument();
  });

  test('confirming a reassignment retries the seat request with reassign:true', async () => {
    vi.mocked(axiosInstance.put)
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: {
            error: { code: 'TABLE_OCCUPIED', message: 'occupied' },
            conflict: { reservationId: 'res_other', guestName: 'Grace Hopper', tableNumbers: ['3'], seatedAt: null },
            alternate: { tableNumbers: ['7'], totalCapacity: 4 },
          },
        },
      })
      .mockResolvedValueOnce({ data: { data: { ...reservation, status: 'SEATED' } } });

    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: /seat guest at table/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^reassign$/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /^reassign$/i }));

    expect(screen.getByText(/move to table 7/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => expect(axiosInstance.put).toHaveBeenCalledTimes(2));
    expect(vi.mocked(axiosInstance.put).mock.calls[1][1]).toMatchObject({
      status: 'SEATED',
      reassign: true,
    });
  });
});

// These counters were accumulated on every COMPLETED / NO_SHOW but nothing
// displayed them, so the "recognise repeat guests and manage no-shows"
// purpose the Privacy Policy states for holding them was not real.
describe('ReservationDrawer guest history', () => {
  const renderWith = (guest_history?: { total_visits: number; total_no_shows: number }) => {
    const queryClient = new QueryClient();
    useDashboardStore.setState({ isDrawerOpen: true, selectedReservationId: 'res_1' });
    return render(
      <QueryClientProvider client={queryClient}>
        <ReservationDrawer cafeId="cafe_1" reservations={[{ ...reservation, guest_history }]} />
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    useDashboardStore.setState({ isDrawerOpen: false, selectedReservationId: null });
  });

  test('shows the visit count for a returning guest', () => {
    renderWith({ total_visits: 7, total_no_shows: 0 });
    expect(screen.getByText('7 previous visits')).toBeInTheDocument();
    // Anchored: a loose /no-show/i also matches the "Mark No-Show" button.
    expect(screen.queryByText(/^\d+ no-shows?$/)).not.toBeInTheDocument();
  });

  test('warns about prior no-shows', () => {
    renderWith({ total_visits: 2, total_no_shows: 1 });
    expect(screen.getByText('2 previous visits')).toBeInTheDocument();
    expect(screen.getByText('1 no-show')).toBeInTheDocument();
  });

  test('singularises a single visit', () => {
    renderWith({ total_visits: 1, total_no_shows: 0 });
    expect(screen.getByText('1 previous visit')).toBeInTheDocument();
  });

  test('shows nothing at all for a first-time guest', () => {
    // A row of zeroes is noise on the busiest screen in the product.
    renderWith({ total_visits: 0, total_no_shows: 0 });
    expect(screen.queryByText(/previous visit/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^\d+ no-shows?$/)).not.toBeInTheDocument();
  });

  test('renders normally when the field is absent entirely', () => {
    // A manifest response cached from before this shipped has no
    // guest_history at all; the drawer must not blow up on it.
    renderWith(undefined);
    expect(screen.getByText('Priya Sharma')).toBeInTheDocument();
    expect(screen.queryByText(/previous visit/i)).not.toBeInTheDocument();
  });
});
