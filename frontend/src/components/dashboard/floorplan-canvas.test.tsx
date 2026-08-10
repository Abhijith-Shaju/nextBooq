import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { FloorplanCanvas } from './floorplan-canvas';
import { useDashboardStore } from '@/store/use-dashboard-store';
import { Table, Reservation } from '@/lib/types/models';

const occupiedTable: Table = {
  id: 't1',
  _id: 't1',
  cafe_id: 'cafe_1',
  table_number: 'T1',
  capacity: 4,
  status: 'active',
};

const emptyTable: Table = {
  id: 't2',
  _id: 't2',
  cafe_id: 'cafe_1',
  table_number: 'T2',
  capacity: 2,
  status: 'active',
};

const seatedReservation: Reservation = {
  id: 'res_1',
  _id: 'res_1',
  cafe_id: 'cafe_1',
  guest_name: 'Grace Hopper',
  guest_email: 'grace@test.com',
  guest_phone: '+1000',
  start_time: '2026-09-05T19:00:00.000Z',
  end_time: '2026-09-05T20:00:00.000Z',
  party_size: 2,
  table_ids: [{ _id: 't1', table_number: 'T1', capacity: 4 }],
  status: 'SEATED',
  __v: 0,
};

describe('FloorplanCanvas keyboard accessibility', () => {
  beforeEach(() => {
    useDashboardStore.setState({ selectedReservationId: null, isDrawerOpen: false });
  });

  test('an occupied table is a real button reachable by keyboard, and Enter opens the drawer', async () => {
    const user = userEvent.setup();
    render(<FloorplanCanvas tables={[occupiedTable, emptyTable]} reservations={[seatedReservation]} />);

    const occupied = screen.getByRole('button', { name: /grace hopper/i });
    occupied.focus();
    expect(occupied).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(useDashboardStore.getState().selectedReservationId).toBe('res_1');
    expect(useDashboardStore.getState().isDrawerOpen).toBe(true);
  });

  test('an empty table with no reservation to open is not a focusable button', () => {
    render(<FloorplanCanvas tables={[emptyTable]} reservations={[]} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Empty')).toBeInTheDocument();
  });
});
