import { describe, expect, test } from 'vitest';
import { resolveTableVisualState } from './table-visual-state';
import { Reservation, Table } from '@/lib/types/models';

const table = (overrides: Partial<Table> = {}): Table => ({
  id: 't1',
  _id: 't1',
  cafe_id: 'cafe1',
  table_number: '5',
  capacity: 4,
  zone: 'indoor',
  floor: 1,
  status: 'active',
  ...overrides,
});

const reservation = (overrides: Partial<Reservation> = {}): Reservation => ({
  id: 'r1',
  cafe_id: 'cafe1',
  user_id: { _id: 'u1', name: 'Priya', email: 'priya@example.com', phone: '+919900000000' },
  start_time: '2026-08-10T13:30:00.000Z',
  end_time: '2026-08-10T15:00:00.000Z',
  party_size: 2,
  table_ids: [{ _id: 't1', table_number: '5', capacity: 4 }],
  status: 'CONFIRMED',
  __v: 0,
  ...overrides,
});

describe('resolveTableVisualState', () => {
  test('an out-of-service table is flagged regardless of reservations', () => {
    const result = resolveTableVisualState(table({ status: 'out_of_service' }), [reservation()]);
    expect(result).toEqual({ tone: 'out-of-service', assignedReservation: null });
  });

  test('a table with no matching reservation reads as empty', () => {
    const result = resolveTableVisualState(
      table(),
      [reservation({ table_ids: [{ _id: 't9', table_number: '9', capacity: 2 }] })]
    );
    expect(result).toEqual({ tone: 'empty', assignedReservation: null });
  });

  test('a table with a SEATED reservation reads as seated', () => {
    const res = reservation({ status: 'SEATED' });
    const result = resolveTableVisualState(table(), [res]);
    expect(result).toEqual({ tone: 'seated', assignedReservation: res });
  });

  test('a table with a CONFIRMED (not yet seated) reservation reads as reserved-soon', () => {
    const res = reservation({ status: 'CONFIRMED' });
    const result = resolveTableVisualState(table(), [res]);
    expect(result).toEqual({ tone: 'reserved-soon', assignedReservation: res });
  });

  test('CANCELLED and COMPLETED reservations do not block the table as occupied', () => {
    const result = resolveTableVisualState(table(), [
      reservation({ status: 'CANCELLED' }),
      reservation({ status: 'COMPLETED', id: 'r2' }),
    ]);
    expect(result).toEqual({ tone: 'empty', assignedReservation: null });
  });

  test('a merged-table reservation marks BOTH physical tables as occupied', () => {
    const partnerTable = table({ id: 't2', _id: 't2', table_number: '6' });
    const res = reservation({
      status: 'SEATED',
      party_size: 6,
      table_ids: [
        { _id: 't1', table_number: '5', capacity: 4 },
        { _id: 't2', table_number: '6', capacity: 2 },
      ],
    });

    expect(resolveTableVisualState(table(), [res])).toEqual({ tone: 'seated', assignedReservation: res });
    expect(resolveTableVisualState(partnerTable, [res])).toEqual({ tone: 'seated', assignedReservation: res });
  });
});
