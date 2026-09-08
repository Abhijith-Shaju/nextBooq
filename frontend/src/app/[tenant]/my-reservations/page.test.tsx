import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import MyReservationsPage from './page';
import { useBookingStore } from '@/store/use-booking-store';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock('@/components/providers/tenant-provider', () => ({
  useTenant: () => ({
    cafe: { id: 'cafe_1', slug: 'demo-cafe', name: 'Demo Cafe', reservation_rules: {}, timezone: 'UTC' },
  }),
}));

vi.mock('@/components/auth/customer-auth-modal', () => ({
  CustomerAuthModal: () => null,
}));

vi.mock('@/components/shared/email-verification-banner', () => ({
  EmailVerificationBanner: () => null,
}));

const reservation = {
  _id: 'res_pending_1',
  status: 'PENDING_PAYMENT',
  party_size: 3,
  start_time: '2026-09-05T19:00:00.000Z',
  payment_data: {
    order_id: 'order_resume_abc',
    amount: 10000,
    currency: 'INR',
    expires_at: '2026-09-05T19:10:00.000Z',
  },
};

// Reached through the detail modal this page opens. Mocked for the same
// reason as the query hook below: this page's tests are about the page, and
// the real mutation needs a QueryClientProvider they have no reason to set up.
vi.mock('@/hooks/customer/use-cancel-reservation', () => ({
  useCancelReservation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/customer/use-customer-reservations', () => ({
  useCustomerReservations: () => ({
    data: [reservation],
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

describe('MyReservationsPage — resume payment', () => {
  beforeEach(() => {
    useBookingStore.getState().resetBooking();
    push.mockReset();
  });

  test('clicking Complete Payment hydrates the booking store from the reservation and navigates to checkout with no query param', async () => {
    render(<MyReservationsPage />);

    fireEvent.click(screen.getByRole('button', { name: /complete payment/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/demo-cafe/checkout'));

    const store = useBookingStore.getState();
    expect(store.reservation).toEqual({
      id: 'res_pending_1',
      status: 'PENDING_PAYMENT',
      razorpay_order_id: 'order_resume_abc',
      amount: 10000,
      currency: 'INR',
      hold_expires_at: '2026-09-05T19:10:00.000Z',
    });
    expect(store.partySize).toBe(3);
    expect(store.holdExpiresAt).toEqual(new Date('2026-09-05T19:10:00.000Z'));
  });
});

describe('MyReservationsPage — booking details', () => {
  beforeEach(() => {
    useBookingStore.getState().resetBooking();
    push.mockReset();
  });

  test('clicking a reservation opens its token, which is otherwise lost after leaving the success page', () => {
    render(<MyReservationsPage />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /view token and details/i }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('#NG_1')).toBeInTheDocument();
  });

  test('Complete Payment does not also open the modal it is nested inside', async () => {
    render(<MyReservationsPage />);

    fireEvent.click(screen.getByRole('button', { name: /complete payment/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/demo-cafe/checkout'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
