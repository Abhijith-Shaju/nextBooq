import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ProfilePage from './page';
import { useBookingStore } from '@/store/use-booking-store';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const useAuthMock = vi.fn();
vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => useAuthMock(),
}));

const useOrganizationMock = vi.fn();
vi.mock('@/hooks/org/use-organization', () => ({
  useOrganization: (...args: unknown[]) => useOrganizationMock(...args),
}));

const useOrgCafesMock = vi.fn();
vi.mock('@/hooks/org/use-org-cafes', () => ({
  useOrgCafes: (...args: unknown[]) => useOrgCafesMock(...args),
}));

const useCustomerReservationsMock = vi.fn();
vi.mock('@/hooks/customer/use-customer-reservations', () => ({
  useCustomerReservations: (...args: unknown[]) => useCustomerReservationsMock(...args),
}));

const resendMutateMock = vi.fn();
vi.mock('@/hooks/auth/use-resend-verification-email', () => ({
  useResendVerificationEmail: () => ({ mutate: resendMutateMock, isPending: false }),
}));

const guestUser = {
  id: 'u1',
  name: 'Priya Sharma',
  email: 'priya@test.com',
  phone: '+15551234567',
  created_at: '2025-01-15T00:00:00.000Z',
  staff_memberships: [],
  owner_org_id: null,
  is_email_verified: true,
  is_platform_admin: false,
};

describe('ProfilePage', () => {
  beforeEach(() => {
    push.mockReset();
    resendMutateMock.mockReset();
    useBookingStore.getState().resetBooking();
    useOrganizationMock.mockReturnValue({ data: null, isLoading: false });
    useOrgCafesMock.mockReturnValue({ data: [], isLoading: false });
    useCustomerReservationsMock.mockReturnValue({ data: [], isLoading: false });
  });

  test('shows the verified badge and no resend button when the email is verified', () => {
    useAuthMock.mockReturnValue({ user: { ...guestUser, is_email_verified: true } });

    render(<ProfilePage />);

    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resend verification/i })).not.toBeInTheDocument();
  });

  test('shows a resend button when the email is not verified, and it calls the mutation', () => {
    useAuthMock.mockReturnValue({ user: { ...guestUser, is_email_verified: false } });

    render(<ProfilePage />);

    expect(screen.getByText('Not verified')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /resend verification/i }));
    expect(resendMutateMock).toHaveBeenCalled();
  });

  test('shows real account fields: phone and member-since date', () => {
    useAuthMock.mockReturnValue({ user: guestUser });

    render(<ProfilePage />);

    expect(screen.getByText('+15551234567')).toBeInTheDocument();
    expect(screen.getByText('January 2025')).toBeInTheDocument();
  });

  test('hides the Organization and Cafes sections for a regular (guest) user', () => {
    useAuthMock.mockReturnValue({ user: guestUser });

    render(<ProfilePage />);

    expect(screen.queryByText('Your Organization')).not.toBeInTheDocument();
    expect(screen.queryByText('Your Cafes')).not.toBeInTheDocument();
  });

  test('shows the org owner\'s organization name and owned cafes with subscription status', () => {
    useAuthMock.mockReturnValue({ user: { ...guestUser, owner_org_id: 'org-1' } });
    useOrganizationMock.mockReturnValue({ data: { id: 'org-1', name: 'Sharma Hospitality Group' }, isLoading: false });
    useOrgCafesMock.mockReturnValue({
      data: [
        { _id: 'cafe-1', name: 'The Daily Grind', slug: 'the-daily-grind', subscription_status: 'active', today_reservation_count: 2 },
      ],
      isLoading: false,
    });

    render(<ProfilePage />);

    expect(screen.getByText('Your Organization')).toBeInTheDocument();
    expect(screen.getByText('Sharma Hospitality Group')).toBeInTheDocument();
    expect(screen.getByText('Your Cafes')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /the daily grind/i });
    expect(link).toHaveAttribute('href', '/the-daily-grind/dashboard');
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  test('shows only the manager\'s cafes (no Organization section) for a cafe manager', () => {
    useAuthMock.mockReturnValue({
      user: {
        ...guestUser,
        staff_memberships: [{ cafe_id: { name: 'Corner Table Café', slug: 'corner-table-cafe' }, role: 'manager', permissions: [] }],
      },
    });

    render(<ProfilePage />);

    expect(screen.queryByText('Your Organization')).not.toBeInTheDocument();
    expect(screen.getByText('Your Cafes')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /corner table café/i });
    expect(link).toHaveAttribute('href', '/corner-table-cafe/dashboard');
  });

  test('renders reservation history with cafe name and status', () => {
    useAuthMock.mockReturnValue({ user: guestUser });
    useCustomerReservationsMock.mockReturnValue({
      data: [
        {
          _id: 'res_1',
          status: 'CONFIRMED',
          party_size: 2,
          start_time: '2026-09-05T19:00:00.000Z',
          cafe_id: { name: 'The Daily Grind', slug: 'the-daily-grind' },
        },
      ],
      isLoading: false,
    });

    render(<ProfilePage />);

    expect(screen.getByText('The Daily Grind')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText('2 guests')).toBeInTheDocument();
  });

  test('shows an empty state when there are no reservations', () => {
    useAuthMock.mockReturnValue({ user: guestUser });

    render(<ProfilePage />);

    expect(screen.getByText(/no reservations yet/i)).toBeInTheDocument();
  });

  test('clicking Complete Payment on a pending reservation hydrates the booking store and navigates to that cafe\'s checkout', async () => {
    useAuthMock.mockReturnValue({ user: guestUser });
    useCustomerReservationsMock.mockReturnValue({
      data: [
        {
          _id: 'res_pending_1',
          status: 'PENDING_PAYMENT',
          party_size: 3,
          start_time: '2026-09-05T19:00:00.000Z',
          cafe_id: { name: 'Sunset Roastery', slug: 'sunset-roastery' },
          payment_data: {
            order_id: 'order_resume_abc',
            amount: 10000,
            currency: 'INR',
            expires_at: '2026-09-05T19:10:00.000Z',
          },
        },
      ],
      isLoading: false,
    });

    render(<ProfilePage />);

    fireEvent.click(screen.getByRole('button', { name: /complete payment/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/sunset-roastery/checkout'));

    const store = useBookingStore.getState();
    expect(store.reservation).toEqual({
      id: 'res_pending_1',
      status: 'PENDING_PAYMENT',
      razorpay_order_id: 'order_resume_abc',
      amount: 10000,
      currency: 'INR',
      hold_expires_at: '2026-09-05T19:10:00.000Z',
    });
  });
});
