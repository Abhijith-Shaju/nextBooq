import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import HostStandDashboardPage from './page';

vi.mock('@/components/providers/tenant-provider', () => ({
  useTenant: () => ({ cafe: { id: 'cafe_1', slug: 'demo-cafe' } }),
}));

vi.mock('@/store/use-dashboard-store', () => ({
  useDashboardStore: () => ({
    selectedDate: '2026-09-05',
    setSelectedDate: vi.fn(),
    selectedReservationId: null,
    openDrawer: vi.fn(),
  }),
}));

const mockUseManifest = vi.fn();
vi.mock('@/hooks/host/use-manifest', () => ({
  useManifest: (...args: unknown[]) => mockUseManifest(...args),
}));

vi.mock('@/hooks/admin/use-tables', () => ({
  useTables: () => ({ data: [] }),
}));

// The right-hand panel and the overlays aren't under test here, and they pull
// in sockets and mutation hooks of their own.
const floorplanReservations = vi.fn();
vi.mock('@/components/dashboard/floorplan-canvas', () => ({
  FloorplanCanvas: (props: { reservations: unknown[] }) => {
    floorplanReservations(props.reservations);
    return null;
  },
}));
vi.mock('@/components/dashboard/reservation-drawer', () => ({ ReservationDrawer: () => null }));
vi.mock('@/components/dashboard/assign-table-modal', () => ({ AssignTableModal: () => null }));

const guest = (
  id: string,
  name: string,
  status: string,
  time: string,
  phone = '+91 90000 00000'
) => ({
  _id: id,
  status,
  party_size: 2,
  start_time: time,
  __v: 0,
  user_id: { _id: `u_${id}`, name, email: `${name.split(' ')[0].toLowerCase()}@example.com`, phone },
});

// Deliberately out of order, and the finished booking is the earliest.
const manifest = [
  guest('aaaa1111bbbb2222cccc3333', 'Ada Lovelace', 'COMPLETED', '2026-09-05T17:00:00.000Z'),
  guest('dddd4444eeee5555ffff6666', 'Bo Diddley', 'CONFIRMED', '2026-09-05T21:00:00.000Z'),
  guest('1111222233334444aaaa7777', 'Cy Twombly', 'SEATED', '2026-09-05T19:00:00.000Z', '+91 98765 43210'),
];

const renderPage = (data = manifest) => {
  mockUseManifest.mockReturnValue({ data, isLoading: false });
  render(<HostStandDashboardPage />);
  return screen.getByPlaceholderText(/search token, name, or phone/i);
};

const listedNames = () =>
  screen
    .getAllByRole('button', { pressed: false })
    .map((btn) => btn.querySelector('h4')?.textContent)
    .filter(Boolean);

describe('HostStandDashboardPage ordering', () => {
  beforeEach(() => {
    mockUseManifest.mockReset();
    floorplanReservations.mockReset();
  });

  test('lists bookings that still need the host first, then finished ones, each by time', () => {
    renderPage();

    expect(listedNames()).toEqual(['Cy Twombly', 'Bo Diddley', 'Ada Lovelace']);
  });
});

describe('HostStandDashboardPage search', () => {
  beforeEach(() => {
    mockUseManifest.mockReset();
    floorplanReservations.mockReset();
  });

  test('narrows the manifest by the token the guest quotes', () => {
    const input = renderPage();

    fireEvent.change(input, { target: { value: '6666' } });

    expect(listedNames()).toEqual(['Bo Diddley']);
  });

  test('narrows by name', () => {
    const input = renderPage();

    fireEvent.change(input, { target: { value: 'twombly' } });

    expect(listedNames()).toEqual(['Cy Twombly']);
  });

  test('narrows by a phone number typed without its spacing', () => {
    const input = renderPage();

    fireEvent.change(input, { target: { value: '9876543210' } });

    expect(listedNames()).toEqual(['Cy Twombly']);
  });

  test('says the search came up empty rather than claiming the day has no bookings', () => {
    const input = renderPage();

    fireEvent.change(input, { target: { value: 'nobody' } });

    expect(screen.getByText(/no reservations matched your search/i)).toBeInTheDocument();
    expect(screen.queryByText(/no reservations found for selected date/i)).not.toBeInTheDocument();
  });

  test('shows the matched count against the day total while filtering', () => {
    const input = renderPage();

    expect(screen.getByText('3 bookings')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'twombly' } });

    expect(screen.getByText('1 of 3 bookings')).toBeInTheDocument();
  });

  test('leaves the floorplan on the full day, so a search cannot hide an occupied table', () => {
    const input = renderPage();

    fireEvent.change(input, { target: { value: 'twombly' } });

    const lastCall = floorplanReservations.mock.calls.at(-1);
    expect(lastCall?.[0]).toHaveLength(3);
  });
});
