import { describe, expect, test } from 'vitest';
import { computeShiftMetrics } from './shift-metrics';
import { Reservation } from '@/lib/types/models';

const reservation = (status: Reservation['status'], party_size: number): Reservation => ({
  id: Math.random().toString(),
  cafe_id: 'cafe1',
  user_id: { _id: 'u1', name: 'Guest', email: 'g@example.com', phone: '+919900000000' },
  start_time: '2026-08-10T13:30:00.000Z',
  end_time: '2026-08-10T15:00:00.000Z',
  party_size,
  status,
  __v: 0,
});

describe('computeShiftMetrics', () => {
  test('totals covers across every reservation regardless of status', () => {
    const metrics = computeShiftMetrics([
      reservation('CONFIRMED', 2),
      reservation('SEATED', 4),
      reservation('CANCELLED', 3),
    ]);
    expect(metrics.totalCovers).toBe(9);
  });

  test('seatedCovers only counts SEATED reservations', () => {
    const metrics = computeShiftMetrics([
      reservation('SEATED', 4),
      reservation('SEATED', 2),
      reservation('CONFIRMED', 5),
    ]);
    expect(metrics.seatedCovers).toBe(6);
  });

  test('expectedCovers counts CONFIRMED and CHECKED_IN, not SEATED', () => {
    const metrics = computeShiftMetrics([
      reservation('CONFIRMED', 2),
      reservation('CHECKED_IN', 3),
      reservation('SEATED', 4),
    ]);
    expect(metrics.expectedCovers).toBe(5);
  });

  test('returns zeroes for an empty manifest', () => {
    expect(computeShiftMetrics([])).toEqual({ totalCovers: 0, seatedCovers: 0, expectedCovers: 0 });
  });

  test('treats a missing party_size as zero rather than NaN', () => {
    const withoutPartySize = { ...reservation('CONFIRMED', 2), party_size: undefined as unknown as number };
    const metrics = computeShiftMetrics([withoutPartySize]);
    expect(metrics.totalCovers).toBe(0);
  });
});
