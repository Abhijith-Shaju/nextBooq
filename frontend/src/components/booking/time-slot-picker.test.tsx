import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TimeSlotPicker } from './time-slot-picker';
import { useBookingStore } from '@/store/use-booking-store';

vi.mock('@/components/providers/tenant-provider', () => ({
  useTenant: () => ({
    cafe: { id: 'cafe_1', slug: 'demo-cafe', reservation_rules: { hold_duration_minutes: 10, booking_lead_time_hours: 24 } },
  }),
}));

const mockUseAvailability = vi.fn();
vi.mock('@/hooks/public/use-availability', () => ({
  useAvailability: (...args: unknown[]) => mockUseAvailability(...args),
}));

describe('TimeSlotPicker error vs. empty state', () => {
  beforeEach(() => {
    useBookingStore.getState().setDate(new Date('2026-08-18T00:00:00.000Z'));
  });

  test('shows a distinct error message when the availability fetch fails, not the sold-out message', () => {
    mockUseAvailability.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    render(<TimeSlotPicker onSelect={() => {}} />);

    expect(screen.getByText(/couldn.t load time slots/i)).toBeInTheDocument();
    expect(screen.queryByText(/no available slots for this selection/i)).not.toBeInTheDocument();
  });

  test('shows the sold-out message when the fetch succeeds with zero slots', () => {
    mockUseAvailability.mockReturnValue({ data: [], isLoading: false, isError: false });

    render(<TimeSlotPicker onSelect={() => {}} />);

    expect(screen.getByText(/no available slots for this selection/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn.t load time slots/i)).not.toBeInTheDocument();
  });
});
