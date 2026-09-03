import { describe, expect, test } from 'vitest';
import { addHours, isSameDay } from 'date-fns';
import { getLeadTimeDisabledBefore } from './timezone';

const isMidnight = (d: Date) =>
  d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;

describe('getLeadTimeDisabledBefore', () => {
  test('returns midnight (local time) on the day that is leadTimeHours ahead of now', () => {
    const now = new Date(2026, 7, 10, 10, 0, 0); // Aug 10, 10:00 local

    const result = getLeadTimeDisabledBefore(24, now);

    expect(isMidnight(result)).toBe(true);
    expect(isSameDay(result, addHours(now, 24))).toBe(true);
  });

  test('a lead time that does not cross midnight still floors to that same day', () => {
    const now = new Date(2026, 7, 10, 10, 0, 0);

    const result = getLeadTimeDisabledBefore(2, now);

    expect(isMidnight(result)).toBe(true);
    expect(isSameDay(result, now)).toBe(true);
  });

  test('zero lead time disables nothing beyond today', () => {
    const now = new Date(2026, 7, 10, 10, 0, 0);

    const result = getLeadTimeDisabledBefore(0, now);

    expect(isMidnight(result)).toBe(true);
    expect(isSameDay(result, now)).toBe(true);
  });
});
