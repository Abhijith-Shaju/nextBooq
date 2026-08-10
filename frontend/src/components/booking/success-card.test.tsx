import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { SuccessCard } from './success-card';
import { useBookingStore } from '@/store/use-booking-store';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/providers/tenant-provider', () => ({
  useTenant: () => ({
    cafe: {
      id: 'cafe_1',
      slug: 'demo-cafe',
      name: 'Demo Cafe',
      reservation_rules: { default_turn_time_minutes: 90 },
      timezone: 'UTC',
    },
  }),
}));

describe('SuccessCard — Add to calendar', () => {
  beforeEach(() => {
    useBookingStore.getState().resetBooking();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  test('downloads a real .ics file and shows success when a date/time is set', () => {
    useBookingStore.setState({ date: new Date('2026-09-05T00:00:00.000Z'), time: '19:00', partySize: 2 });

    render(<SuccessCard />);
    fireEvent.click(screen.getByRole('button', { name: /add to calendar/i }));

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(blobArg.type).toBe('text/calendar;charset=utf-8');
    expect(toast.success).toHaveBeenCalledWith('Calendar event downloaded (.ics)');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  test('shows an error and does not attempt a download when there is no date/time', () => {
    useBookingStore.setState({ date: null, time: null });

    render(<SuccessCard />);
    fireEvent.click(screen.getByRole('button', { name: /add to calendar/i }));

    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
});
