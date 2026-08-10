import { describe, expect, test } from 'vitest';
import { getReservationTableIds, getReservationTableNumbers, isTableAssignedToReservation } from './reservation-tables';
import type { Reservation, Table } from '@/lib/types/models';

const baseReservation: Reservation = {
  id: 'r1',
  cafe_id: 'cafe1',
  guest_name: 'Priya',
  guest_email: 'priya@example.com',
  guest_phone: '+919900000000',
  start_time: '2026-08-10T13:30:00.000Z',
  end_time: '2026-08-10T15:00:00.000Z',
  party_size: 6,
  status: 'CONFIRMED',
  __v: 0,
};

const table = (overrides: Partial<Table> = {}): Table => ({
  id: 't1',
  cafe_id: 'cafe1',
  table_number: '3',
  capacity: 4,
  status: 'active',
  ...overrides,
});

describe('getReservationTableIds', () => {
  test('extracts ids from populated table_ids objects (real API shape: _id, no id)', () => {
    const reservation: Reservation = {
      ...baseReservation,
      table_ids: [
        { _id: 'tbl_3', table_number: '3', capacity: 2 },
        { _id: 'tbl_4', table_number: '4', capacity: 4 },
      ],
    };
    expect(getReservationTableIds(reservation)).toEqual(['tbl_3', 'tbl_4']);
  });

  test('extracts ids when table_ids are plain unpopulated id strings', () => {
    const reservation: Reservation = { ...baseReservation, table_ids: ['tbl_3', 'tbl_4'] };
    expect(getReservationTableIds(reservation)).toEqual(['tbl_3', 'tbl_4']);
  });

  test('returns an empty array when table_ids is missing', () => {
    expect(getReservationTableIds(baseReservation)).toEqual([]);
  });
});

describe('getReservationTableNumbers', () => {
  test('extracts human-readable table numbers from populated table_ids', () => {
    const reservation: Reservation = {
      ...baseReservation,
      table_ids: [
        { _id: 'tbl_3', table_number: '3', capacity: 2 },
        { _id: 'tbl_4', table_number: '4', capacity: 4 },
      ],
    };
    expect(getReservationTableNumbers(reservation)).toEqual(['3', '4']);
  });

  test('returns an empty array when table_ids are unpopulated id strings (no table_number to show)', () => {
    const reservation: Reservation = { ...baseReservation, table_ids: ['tbl_3'] };
    expect(getReservationTableNumbers(reservation)).toEqual([]);
  });
});

describe('isTableAssignedToReservation', () => {
  test('true when the table id (via _id) is in the reservation\'s table_ids', () => {
    const t = table({ id: 'tbl_3', _id: 'tbl_3' } as Table);
    const reservation: Reservation = {
      ...baseReservation,
      table_ids: [{ _id: 'tbl_3', table_number: '3', capacity: 2 }],
    };
    expect(isTableAssignedToReservation(t, reservation)).toBe(true);
  });

  test('true for a merged second table on the same reservation', () => {
    const t = table({ id: 'tbl_4', _id: 'tbl_4' } as Table);
    const reservation: Reservation = {
      ...baseReservation,
      table_ids: [
        { _id: 'tbl_3', table_number: '3', capacity: 2 },
        { _id: 'tbl_4', table_number: '4', capacity: 4 },
      ],
    };
    expect(isTableAssignedToReservation(t, reservation)).toBe(true);
  });

  test('false when the table is not referenced by the reservation', () => {
    const t = table({ id: 'tbl_9', _id: 'tbl_9' } as Table);
    const reservation: Reservation = {
      ...baseReservation,
      table_ids: [{ _id: 'tbl_3', table_number: '3', capacity: 2 }],
    };
    expect(isTableAssignedToReservation(t, reservation)).toBe(false);
  });
});
