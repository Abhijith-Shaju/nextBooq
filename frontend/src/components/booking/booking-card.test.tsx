import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { BookingCard } from './booking-card';
import { useTenant } from '@/components/providers/tenant-provider';
import { useBookingStore } from '@/store/use-booking-store';

vi.mock('@/components/providers/tenant-provider', () => ({
  useTenant: vi.fn(),
}));

vi.mock('@/store/use-booking-store', () => ({
  useBookingStore: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () => (props: any) => <div data-testid="motion-div" {...props} />,
    }
  ),
}));

vi.mock('./time-slot-picker', () => ({
  TimeSlotPicker: () => <div data-testid="time-slot-picker" />,
}));

vi.mock('./party-size-select', () => ({
  PartySizeSelect: () => <div data-testid="party-size-select" />,
}));

vi.mock('./date-picker', () => ({
  DatePicker: () => <div data-testid="date-picker" />,
}));

vi.mock('./auth-overlay', () => ({
  AuthOverlay: () => <div data-testid="auth-overlay" />,
}));

const baseCafe = {
  id: 'cafe1',
  slug: 'demo',
  name: 'Demo Cafe',
  timezone: 'UTC',
  reservation_rules: {},
};

const baseBookingStore = {
  partySize: 2,
  date: null,
  time: null,
  setCafe: vi.fn(),
};

describe('BookingCard', () => {
  beforeEach(() => {
    vi.mocked(useBookingStore).mockReturnValue(baseBookingStore as any);
  });

  test('shows a "not available" message instead of the booking form when payments are not configured', () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: { ...baseCafe, payments: { razorpay_key_id: '', configured: false } },
    } as any);

    render(<BookingCard />);

    expect(screen.getByText(/aren't available|not available/i)).toBeInTheDocument();
    expect(screen.queryByText(/guests & date/i)).not.toBeInTheDocument();
  });

  test('shows the normal booking form when payments are configured', () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: { ...baseCafe, payments: { razorpay_key_id: 'rzp_test_x', configured: true } },
    } as any);

    render(<BookingCard />);

    expect(screen.queryByText(/aren't available|not available/i)).not.toBeInTheDocument();
    expect(screen.getByText(/guests & date/i)).toBeInTheDocument();
  });
});
