import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { AssignTableModal } from './assign-table-modal';
import { useDashboardStore } from '@/store/use-dashboard-store';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Reservation, Table } from '@/lib/types/models';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/api/axios-instance', () => ({
  axiosInstance: { put: vi.fn() },
}));

const emptyTable: Table = {
  id: 't1',
  _id: 't1',
  cafe_id: 'cafe_1',
  table_number: '5',
  capacity: 4,
  zone: 'indoor',
  floor: 1,
  status: 'active',
};

const makeReservation = (overrides: Partial<Reservation> = {}): Reservation => ({
  id: 'res_1',
  _id: 'res_1',
  cafe_id: 'cafe_1',
  user_id: { _id: 'u1', name: 'Priya Sharma', email: 'priya@test.com', phone: '+919900000000' },
  start_time: '2026-09-05T19:00:00.000Z',
  end_time: '2026-09-05T20:00:00.000Z',
  party_size: 2,
  status: 'CONFIRMED',
  __v: 0,
  ...overrides,
});

const renderModal = (reservations: Reservation[], tables: Table[] = [emptyTable]) => {
  const queryClient = new QueryClient();
  useDashboardStore.setState({ isAssignTableOpen: true, assignTableTargetId: 't1' });
  return render(
    <QueryClientProvider client={queryClient}>
      <AssignTableModal cafeId="cafe_1" tables={tables} reservations={reservations} />
    </QueryClientProvider>
  );
};

describe('AssignTableModal', () => {
  beforeEach(() => {
    useDashboardStore.setState({ isAssignTableOpen: false, assignTableTargetId: null });
    vi.mocked(axiosInstance.put).mockReset();
  });

  test('lists a CONFIRMED reservation that fits the table capacity', () => {
    renderModal([makeReservation()]);

    expect(screen.getByText('Priya Sharma')).toBeInTheDocument();
  });

  test('excludes a reservation whose party size exceeds the table capacity', () => {
    renderModal([makeReservation({ party_size: 10 })]);

    expect(screen.queryByText('Priya Sharma')).not.toBeInTheDocument();
    expect(screen.getByText(/no reservations today fit/i)).toBeInTheDocument();
  });

  test('excludes a reservation already seated at this exact table', () => {
    renderModal([makeReservation({ table_ids: [{ _id: 't1', table_number: '5', capacity: 4 }] })]);

    expect(screen.queryByText('Priya Sharma')).not.toBeInTheDocument();
  });

  test('excludes reservations in states that cannot be assigned yet (HOLD, PENDING_PAYMENT) or are terminal', () => {
    renderModal([
      makeReservation({ id: 'r1', _id: 'r1', status: 'HOLD' }),
      makeReservation({ id: 'r2', _id: 'r2', status: 'CANCELLED' }),
    ]);

    expect(screen.getByText(/no reservations today fit/i)).toBeInTheDocument();
  });

  test('clicking a candidate assigns it to the table and closes on success', async () => {
    vi.mocked(axiosInstance.put).mockResolvedValue({
      data: { data: { ...makeReservation(), table_ids: [{ _id: 't1', table_number: '5', capacity: 4 }] } },
    });

    renderModal([makeReservation()]);

    fireEvent.click(screen.getByText('Priya Sharma'));

    await waitFor(() =>
      expect(axiosInstance.put).toHaveBeenCalledWith('/api/v1/cafes/cafe_1/reservations/res_1/table', {
        table_id: 't1',
        version: 0,
      })
    );
    await waitFor(() => expect(useDashboardStore.getState().isAssignTableOpen).toBe(false));
  });

  test('assigning a party that spans merged tables asks for confirmation first', async () => {
    const merged = makeReservation({
      party_size: 4,
      table_ids: [
        { _id: 'tA', table_number: '1', capacity: 2 },
        { _id: 'tB', table_number: '2', capacity: 2 },
      ],
    });
    renderModal([merged]);

    fireEvent.click(screen.getByText('Priya Sharma'));

    // Nothing committed yet — the host has to confirm losing the merge.
    expect(axiosInstance.put).not.toHaveBeenCalled();
    expect(await screen.findByText(/move this party off their merged tables/i)).toBeInTheDocument();
    expect(screen.getByText(/currently across T-1 \+ T-2/i)).toBeInTheDocument();
  });

  test('confirming the merge warning performs the assignment', async () => {
    vi.mocked(axiosInstance.put).mockResolvedValue({ data: { data: makeReservation() } });
    const merged = makeReservation({
      party_size: 4,
      table_ids: [
        { _id: 'tA', table_number: '1', capacity: 2 },
        { _id: 'tB', table_number: '2', capacity: 2 },
      ],
    });
    renderModal([merged]);

    fireEvent.click(screen.getByText('Priya Sharma'));
    fireEvent.click(await screen.findByRole('button', { name: /move party/i }));

    await waitFor(() =>
      expect(axiosInstance.put).toHaveBeenCalledWith('/api/v1/cafes/cafe_1/reservations/res_1/table', {
        table_id: 't1',
        version: 0,
      })
    );
  });

  test('a single-table party is assigned directly, with no confirmation', async () => {
    vi.mocked(axiosInstance.put).mockResolvedValue({ data: { data: makeReservation() } });
    renderModal([makeReservation({ table_ids: [{ _id: 'tA', table_number: '9', capacity: 4 }] })]);

    fireEvent.click(screen.getByText('Priya Sharma'));

    await waitFor(() => expect(axiosInstance.put).toHaveBeenCalled());
    expect(screen.queryByText(/move this party off their merged tables/i)).not.toBeInTheDocument();
  });

  test('renders nothing when closed', () => {
    useDashboardStore.setState({ isAssignTableOpen: false, assignTableTargetId: null });
    const queryClient = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <AssignTableModal cafeId="cafe_1" tables={[emptyTable]} reservations={[makeReservation()]} />
      </QueryClientProvider>
    );

    expect(container).toBeEmptyDOMElement();
  });
});
