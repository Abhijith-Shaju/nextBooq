import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ManifestTable } from './manifest-table';
import { useDashboardStore } from '@/store/use-dashboard-store';
import { Reservation } from '@/lib/types/models';

const reservation: Reservation = {
  id: 'res_1',
  _id: 'res_1',
  cafe_id: 'cafe_1',
  guest_name: 'Ada Lovelace',
  guest_email: 'ada@test.com',
  guest_phone: '+1000',
  start_time: '2026-09-05T19:00:00.000Z',
  end_time: '2026-09-05T20:00:00.000Z',
  party_size: 2,
  status: 'CONFIRMED',
  __v: 0,
};

describe('ManifestTable keyboard accessibility', () => {
  beforeEach(() => {
    useDashboardStore.setState({ selectedReservationId: null, isDrawerOpen: false });
  });

  test('a row is a real button reachable by keyboard, and Enter opens the drawer', async () => {
    const user = userEvent.setup();
    render(<ManifestTable reservations={[reservation]} />);

    const row = screen.getByRole('button', { name: /ada lovelace/i });
    row.focus();
    expect(row).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(useDashboardStore.getState().selectedReservationId).toBe('res_1');
    expect(useDashboardStore.getState().isDrawerOpen).toBe(true);
  });
});
