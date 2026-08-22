import { describe, test, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { TenantProvider } from './tenant-provider';
import { useBookingStore } from '@/store/use-booking-store';
import { useDashboardStore } from '@/store/use-dashboard-store';
import { Cafe } from '@/lib/types/models';

const makeCafe = (id: string): Cafe => ({
  id,
  slug: `cafe-${id}`,
  name: `Cafe ${id}`,
  timezone: 'UTC',
  reservation_rules: {
    default_turn_time_minutes: 90,
    max_party_size: 12,
    booking_lead_time_hours: 24,
    hold_duration_minutes: 10,
    reservation_fee: 100,
  },
});

describe('TenantProvider resets per-tenant client state on tenant switch', () => {
  beforeEach(() => {
    useBookingStore.getState().resetBooking();
    useDashboardStore.getState().reset();
  });

  test('switching to a different cafe id clears in-progress booking and dashboard UI state', () => {
    const { rerender } = render(
      <TenantProvider cafe={makeCafe('cafe_a')}>
        <div />
      </TenantProvider>
    );

    useBookingStore.getState().setPartySize(6);
    useDashboardStore.getState().openDrawer('res_123');

    expect(useBookingStore.getState().partySize).toBe(6);
    expect(useDashboardStore.getState().isDrawerOpen).toBe(true);

    rerender(
      <TenantProvider cafe={makeCafe('cafe_b')}>
        <div />
      </TenantProvider>
    );

    expect(useBookingStore.getState().partySize).toBe(2);
    expect(useDashboardStore.getState().isDrawerOpen).toBe(false);
    expect(useDashboardStore.getState().selectedReservationId).toBeNull();
  });

  test('re-rendering with the same cafe id does not clobber in-progress state', () => {
    const { rerender } = render(
      <TenantProvider cafe={makeCafe('cafe_a')}>
        <div />
      </TenantProvider>
    );

    useBookingStore.getState().setPartySize(5);

    rerender(
      <TenantProvider cafe={makeCafe('cafe_a')}>
        <div />
      </TenantProvider>
    );

    expect(useBookingStore.getState().partySize).toBe(5);
  });
});
