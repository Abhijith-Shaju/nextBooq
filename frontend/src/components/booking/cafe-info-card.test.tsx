import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { CafeInfoCard } from './cafe-info-card';

const baseCafe = {
  id: 'cafe_1',
  slug: 'demo-cafe',
  name: 'Demo Cafe',
  timezone: 'UTC',
  reservation_rules: {
    default_turn_time_minutes: 90,
    max_party_size: 12,
    booking_lead_time_hours: 24,
    hold_duration_minutes: 10,
    reservation_fee: 100,
  },
};

let mockCafe: any = baseCafe;

vi.mock('@/components/providers/tenant-provider', () => ({
  useTenant: () => ({ cafe: mockCafe }),
}));

describe('CafeInfoCard', () => {
  test('does not show a contact tile when the cafe has no contact_phone', () => {
    mockCafe = baseCafe;
    render(<CafeInfoCard />);
    expect(screen.queryByText(/contact & support/i)).not.toBeInTheDocument();
  });

  test('does not show a contact tile when contact_phone is blank/whitespace-only', () => {
    mockCafe = { ...baseCafe, contact_phone: '   ' };
    render(<CafeInfoCard />);
    expect(screen.queryByText(/contact & support/i)).not.toBeInTheDocument();
  });

  // A customer with an issue/query should be able to call the cafe directly
  // from the storefront.
  test('shows a callable phone link when the cafe has set a contact_phone', () => {
    mockCafe = { ...baseCafe, contact_phone: '+91 98765 43210' };
    render(<CafeInfoCard />);

    expect(screen.getByText(/contact & support/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /call \+91 98765 43210/i });
    expect(link).toHaveAttribute('href', 'tel:+91 98765 43210');
  });

  test('still shows the standard policy tiles regardless of contact_phone', () => {
    mockCafe = { ...baseCafe, contact_phone: '+91 98765 43210' };
    render(<CafeInfoCard />);

    expect(screen.getByText(/dining duration/i)).toBeInTheDocument();
    expect(screen.getByText(/hold protection/i)).toBeInTheDocument();
    expect(screen.getByText(/group capacity/i)).toBeInTheDocument();
  });
});

const address = {
  line1: '12 Church Street',
  line2: 'Ashok Nagar',
  city: 'Bengaluru',
  state: 'Karnataka',
  postal_code: '560001',
  country: 'India',
};

describe('CafeInfoCard address tile', () => {
  test('does not show an address tile when the cafe has no address', () => {
    mockCafe = baseCafe;
    render(<CafeInfoCard />);
    expect(screen.queryByText(/find us/i)).not.toBeInTheDocument();
  });

  test('does not show an address tile when line 1 is whitespace-only', () => {
    mockCafe = { ...baseCafe, address: { ...address, line1: '   ' } };
    render(<CafeInfoCard />);
    expect(screen.queryByText(/find us/i)).not.toBeInTheDocument();
  });

  test('shows the address as plain text when there is no map link', () => {
    mockCafe = { ...baseCafe, address };
    render(<CafeInfoCard />);
    expect(screen.getByText(/find us/i)).toBeInTheDocument();
    expect(screen.getByText(/12 Church Street/)).toBeInTheDocument();
    expect(screen.getByText(/560001/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /12 Church Street/ })).not.toBeInTheDocument();
  });

  test('links the address to the map url with a safe rel when one is set', () => {
    mockCafe = { ...baseCafe, address: { ...address, map_url: 'https://maps.google.com/?q=filter+kaapi' } };
    render(<CafeInfoCard />);

    const link = screen.getByRole('link', { name: /12 Church Street/ });
    expect(link).toHaveAttribute('href', 'https://maps.google.com/?q=filter+kaapi');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });
});
