import { describe, expect, test } from 'vitest';
import { sortManifestReservations, isPendingReservation } from './manifest-order';
import type { Reservation } from '@/lib/types/models';

const at = (time: string, status: Reservation['status'], id = time): Reservation =>
  ({ _id: id, start_time: time, status, party_size: 2, __v: 0 }) as unknown as Reservation;

const ids = (list: Reservation[]) => list.map((r) => r._id);

describe('isPendingReservation', () => {
  test('treats anything still needing the host as pending', () => {
    for (const status of ['HOLD', 'PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'SEATED'] as const) {
      expect(isPendingReservation(at('2026-09-05T19:00:00.000Z', status))).toBe(true);
    }
  });

  test('treats finished bookings as settled', () => {
    for (const status of ['COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW', 'LEFT_BEFORE_SEATING'] as const) {
      expect(isPendingReservation(at('2026-09-05T19:00:00.000Z', status))).toBe(false);
    }
  });
});

describe('sortManifestReservations', () => {
  test('puts pending bookings ahead of settled ones even when they are later in the day', () => {
    const sorted = sortManifestReservations([
      at('2026-09-05T18:00:00.000Z', 'COMPLETED', 'done_early'),
      at('2026-09-05T21:00:00.000Z', 'CONFIRMED', 'pending_late'),
    ]);

    expect(ids(sorted)).toEqual(['pending_late', 'done_early']);
  });

  test('orders each group earliest first', () => {
    const sorted = sortManifestReservations([
      at('2026-09-05T20:00:00.000Z', 'CONFIRMED', 'p_20'),
      at('2026-09-05T21:00:00.000Z', 'NO_SHOW', 's_21'),
      at('2026-09-05T18:00:00.000Z', 'SEATED', 'p_18'),
      at('2026-09-05T19:00:00.000Z', 'CANCELLED', 's_19'),
      at('2026-09-05T19:30:00.000Z', 'HOLD', 'p_1930'),
    ]);

    expect(ids(sorted)).toEqual(['p_18', 'p_1930', 'p_20', 's_19', 's_21']);
  });

  test('sorts a booking with an unusable time last in its group rather than scrambling the rest', () => {
    const broken = { _id: 'broken', start_time: '', status: 'CONFIRMED', party_size: 2, __v: 0 } as unknown as Reservation;
    const sorted = sortManifestReservations([
      broken,
      at('2026-09-05T20:00:00.000Z', 'CONFIRMED', 'p_20'),
      at('2026-09-05T18:00:00.000Z', 'CONFIRMED', 'p_18'),
    ]);

    expect(ids(sorted)).toEqual(['p_18', 'p_20', 'broken']);
  });

  test('does not mutate the caller array, which comes straight from the query cache', () => {
    const input = [
      at('2026-09-05T18:00:00.000Z', 'COMPLETED', 'done'),
      at('2026-09-05T21:00:00.000Z', 'CONFIRMED', 'pending'),
    ];

    sortManifestReservations(input);

    expect(ids(input)).toEqual(['done', 'pending']);
  });

  test('handles an empty manifest', () => {
    expect(sortManifestReservations([])).toEqual([]);
  });
});
