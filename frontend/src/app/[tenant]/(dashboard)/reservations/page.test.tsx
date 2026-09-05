import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ReservationsHistoryPage from './page';

vi.mock('@/components/providers/tenant-provider', () => ({
  useTenant: () => ({ cafe: { id: 'cafe_1', slug: 'demo-cafe' } }),
}));

// The page reads the caller's permissions to decide whether to offer the
// "flag refund" action. Default: no manage_billing, so the column is absent
// and the pre-existing tests below see the table they always did.
const mockUseAuth = vi.fn(() => ({
  user: { id: 'u_staff', staff_memberships: [{ cafe_id: 'cafe_1', role: 'host', permissions: ['view_reservations'] }] },
}));
vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/hooks/host/use-refunds-owed', () => ({
  useMarkRefundOwed: () => ({ mutate: mockFlagMutate, isPending: false }),
}));
const mockFlagMutate = vi.fn();

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

// The automatic paths only queue refunds the rules require. A cafe choosing to
// refund — a complaint, a waived no-show, a booking taken under
// non-refundable terms — had no way to record that decision.
describe('ReservationsHistoryPage flagging a refund owed', () => {
  const paid = {
    _id: 'aaaa1111bbbb2222cccc3333',
    start_time: '2026-09-05T19:00:00.000Z',
    party_size: 2,
    status: 'COMPLETED',
    __v: 0,
    user_id: { _id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' },
    payment_data: { payment_id: 'pay_ABC', amount: 250 },
  };
  const unpaid = { ...paid, _id: 'dddd4444eeee5555ffff6666', payment_data: { amount: 250 } };
  const alreadyOwed = {
    ...paid,
    _id: 'eeee7777ffff8888aaaa9999',
    payment_data: { payment_id: 'pay_DEF', amount: 250, requires_manual_refund: true },
  };

  const asBilling = () =>
    mockUseAuth.mockReturnValue({
      user: {
        id: 'u_owner',
        staff_memberships: [
          { cafe_id: 'cafe_1', role: 'owner', permissions: ['view_reservations', 'manage_billing'] },
        ],
      },
    } as never);

  const asHost = () =>
    mockUseAuth.mockReturnValue({
      user: {
        id: 'u_host',
        staff_memberships: [{ cafe_id: 'cafe_1', role: 'host', permissions: ['view_reservations'] }],
      },
    } as never);

  test('staff without billing access never see the action', () => {
    asHost();
    mockUseManifest.mockReturnValue({ data: [paid], isLoading: false, isError: false });

    render(<ReservationsHistoryPage />);

    expect(screen.queryByRole('button', { name: /flag refund/i })).not.toBeInTheDocument();
  });

  test('offers the action on a paid booking', () => {
    asBilling();
    mockUseManifest.mockReturnValue({ data: [paid], isLoading: false, isError: false });

    render(<ReservationsHistoryPage />);

    expect(screen.getByRole('button', { name: /flag refund/i })).toBeInTheDocument();
  });

  test('does not offer it on a booking that was never paid for', () => {
    // The API refuses these; offering the button would just always error.
    asBilling();
    mockUseManifest.mockReturnValue({ data: [unpaid], isLoading: false, isError: false });

    render(<ReservationsHistoryPage />);

    expect(screen.queryByRole('button', { name: /flag refund/i })).not.toBeInTheDocument();
  });

  test('shows a booking already on the queue as owed, with no action', () => {
    asBilling();
    mockUseManifest.mockReturnValue({ data: [alreadyOwed], isLoading: false, isError: false });

    render(<ReservationsHistoryPage />);

    expect(screen.getByText('Refund owed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /flag refund/i })).not.toBeInTheDocument();
  });

  test('the dialog requires a reason before it will submit', () => {
    asBilling();
    mockFlagMutate.mockReset();
    mockUseManifest.mockReturnValue({ data: [paid], isLoading: false, isError: false });

    render(<ReservationsHistoryPage />);
    fireEvent.click(screen.getByRole('button', { name: /flag refund/i }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/does not send any money/i);

    fireEvent.click(screen.getByRole('button', { name: /flag refund owed/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/say why this refund is owed/i);
    expect(mockFlagMutate).not.toHaveBeenCalled();
  });

  test('submits the reason', () => {
    asBilling();
    mockFlagMutate.mockReset();
    mockUseManifest.mockReturnValue({ data: [paid], isLoading: false, isError: false });

    render(<ReservationsHistoryPage />);
    fireEvent.click(screen.getByRole('button', { name: /flag refund/i }));
    fireEvent.change(screen.getByLabelText(/why is this owed/i), {
      target: { value: '  Kitchen closed early  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /flag refund owed/i }));

    expect(mockFlagMutate).toHaveBeenCalledWith(
      { reservationId: 'aaaa1111bbbb2222cccc3333', reason: 'Kitchen closed early' },
      expect.any(Object)
    );
  });
});
