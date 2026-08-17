import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TenantProvider, useTenant, buildTenantPath } from './tenant-provider';
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

describe('buildTenantPath', () => {
  const cafe = { slug: 'vtcafe' };

  test('prefixes the slug for path-based access', () => {
    expect(buildTenantPath(cafe, '/dashboard', false)).toBe('/vtcafe/dashboard');
    expect(buildTenantPath(cafe, '/', false)).toBe('/vtcafe');
    expect(buildTenantPath(cafe, '', false)).toBe('/vtcafe');
  });

  test('does not prefix the slug for subdomain access, since it is already implied by the Host header', () => {
    expect(buildTenantPath(cafe, '/dashboard', true)).toBe('/dashboard');
    expect(buildTenantPath(cafe, '/', true)).toBe('/');
    expect(buildTenantPath(cafe, '', true)).toBe('/');
  });

  test('normalizes a path missing its leading slash the same way in both modes', () => {
    expect(buildTenantPath(cafe, 'dashboard', false)).toBe('/vtcafe/dashboard');
    expect(buildTenantPath(cafe, 'dashboard', true)).toBe('/dashboard');
  });
});

describe('TenantProvider.tenantPath via useTenant()', () => {
  function Probe() {
    const { tenantPath } = useTenant();
    return <div data-testid="path">{tenantPath('/dashboard')}</div>;
  }

  test('exposes a slug-prefixed tenantPath by default (path-based access)', () => {
    render(
      <TenantProvider cafe={makeCafe('a')}>
        <Probe />
      </TenantProvider>
    );

    expect(screen.getByTestId('path')).toHaveTextContent('/cafe-a/dashboard');
  });

  test('exposes an unprefixed tenantPath when isSubdomainAccess is true', () => {
    render(
      <TenantProvider cafe={makeCafe('a')} isSubdomainAccess>
        <Probe />
      </TenantProvider>
    );

    expect(screen.getByTestId('path')).toHaveTextContent('/dashboard');
  });
});
