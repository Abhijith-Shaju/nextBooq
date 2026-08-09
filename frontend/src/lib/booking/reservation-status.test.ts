import { describe, expect, test } from 'vitest';
import { describeReservationStatus } from './reservation-status';

describe('describeReservationStatus', () => {
  test.each([
    ['HOLD', 'Held', 'pending'],
    ['PENDING_PAYMENT', 'Awaiting payment', 'pending'],
    ['CONFIRMED', 'Confirmed', 'success'],
    ['CHECKED_IN', 'Checked in', 'success'],
    ['SEATED', 'Seated', 'success'],
    ['COMPLETED', 'Completed', 'neutral'],
    ['CANCELLED', 'Cancelled', 'critical'],
    ['EXPIRED', 'Expired', 'critical'],
    ['NO_SHOW', 'No-show', 'critical'],
    ['LEFT_BEFORE_SEATING', 'Left before seating', 'critical'],
  ] as const)('maps %s to label %j with tone %j', (status, label, tone) => {
    expect(describeReservationStatus(status)).toEqual({ label, tone });
  });

  test('falls back to a title-cased label with a neutral tone for an unrecognized status', () => {
    expect(describeReservationStatus('SOME_NEW_STATUS')).toEqual({
      label: 'Some new status',
      tone: 'neutral',
    });
  });
});
