import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { CountdownTimer } from './countdown-timer';
import { useBookingStore } from '@/store/use-booking-store';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/components/providers/tenant-provider', () => ({
  useTenant: () => ({
    cafe: { id: 'cafe_1', slug: 'demo-cafe', reservation_rules: { hold_duration_minutes: 10 } },
  }),
}));

describe('CountdownTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    push.mockReset();
    useBookingStore.getState().resetBooking();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('on hold expiry, redirects to the tenant storefront rather than the site root', async () => {
    useBookingStore.getState().setHoldExpiresAt(new Date(Date.now() + 500));

    render(<CountdownTimer />);

    await vi.advanceTimersByTimeAsync(1000);

    expect(push).toHaveBeenCalledWith('/demo-cafe');
  });
});
