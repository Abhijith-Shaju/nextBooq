import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ReservationsHistoryPage from './page';

vi.mock('@/components/providers/tenant-provider', () => ({
  useTenant: () => ({ cafe: { id: 'cafe_1', slug: 'demo-cafe' } }),
}));

const mockUseManifest = vi.fn();
vi.mock('@/hooks/host/use-manifest', () => ({
  useManifest: (...args: unknown[]) => mockUseManifest(...args),
}));

describe('ReservationsHistoryPage error vs. empty state', () => {
  test('shows a distinct error message when the fetch fails, not the empty-state message', () => {
    mockUseManifest.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    render(<ReservationsHistoryPage />);

    expect(screen.getByText(/couldn.t load/i)).toBeInTheDocument();
    expect(screen.queryByText(/no reservations matched/i)).not.toBeInTheDocument();
  });

  test('shows the empty-state message when the fetch succeeds with zero results', () => {
    mockUseManifest.mockReturnValue({ data: [], isLoading: false, isError: false });

    render(<ReservationsHistoryPage />);

    expect(screen.getByText(/no reservations matched/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn.t load/i)).not.toBeInTheDocument();
  });
});

describe('ReservationsHistoryPage search', () => {
  const ada = {
    _id: 'aaaa1111bbbb2222cccc3333', // token 3333
    start_time: '2026-09-05T19:00:00.000Z',
    party_size: 2,
    status: 'CONFIRMED',
    __v: 0,
    user_id: { _id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', phone: '+91 98765 43210' },
  };
  const bo = {
    _id: 'dddd4444eeee5555ffff6666', // token 6666
    start_time: '2026-09-05T20:00:00.000Z',
    party_size: 4,
    status: 'CONFIRMED',
    __v: 0,
    user_id: { _id: 'u2', name: 'Bo Diddley', email: 'bo@example.com', phone: '+91 91111 22222' },
  };

  const renderWithBoth = () => {
    mockUseManifest.mockReturnValue({ data: [ada, bo], isLoading: false, isError: false });
    render(<ReservationsHistoryPage />);
    return screen.getByPlaceholderText(/search token, name, or phone/i);
  };

  test('finds the booking by the token the guest quotes at the door', () => {
    const input = renderWithBoth();

    fireEvent.change(input, { target: { value: '3333' } });

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByText('Bo Diddley')).not.toBeInTheDocument();
  });

  test('accepts the token with the # the guest sees on their screen', () => {
    const input = renderWithBoth();

    fireEvent.change(input, { target: { value: '#6666' } });

    expect(screen.getByText('Bo Diddley')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  test('still finds a booking by guest name', () => {
    const input = renderWithBoth();

    fireEvent.change(input, { target: { value: 'ada' } });

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByText('Bo Diddley')).not.toBeInTheDocument();
  });

  test('matches a phone number typed without the spaces or country code it is stored with', () => {
    const input = renderWithBoth();

    fireEvent.change(input, { target: { value: '9876543210' } });

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByText('Bo Diddley')).not.toBeInTheDocument();
  });

  test('shows every booking when the search box is empty', () => {
    const input = renderWithBoth();

    fireEvent.change(input, { target: { value: 'ada' } });
    fireEvent.change(input, { target: { value: '' } });

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Bo Diddley')).toBeInTheDocument();
  });

  test('displays the token in its own column so staff can read it back', () => {
    mockUseManifest.mockReturnValue({ data: [ada], isLoading: false, isError: false });
    render(<ReservationsHistoryPage />);

    expect(screen.getByText('3333')).toBeInTheDocument();
    expect(screen.getByText('+91 98765 43210')).toBeInTheDocument();
  });
});
