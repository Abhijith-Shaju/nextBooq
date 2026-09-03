import { describe, expect, test } from 'vitest';
import { addHours, isSameDay } from 'date-fns';
import { cafeLocalToUTC, getLeadTimeDisabledBefore } from './timezone';

const isMidnight = (d: Date) =>
  d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;

describe('cafeLocalToUTC', () => {
  // These expectations are absolute instants, so they hold no matter which
  // timezone the test runner sits in. That is the point: the bug this
  // replaced (`new Date(`${dateKey}T${time}:00`)`) resolved the slot in the
  // *browser's* zone, so it produced these values only by luck when the
  // runner happened to match the cafe.
  test('resolves a wall-clock slot in the cafe timezone (IST, +05:30)', () => {
    expect(cafeLocalToUTC('2026-09-05', '19:00', 'Asia/Kolkata').toISOString())
      .toBe('2026-09-05T13:30:00.000Z');
  });

  test('resolves the same wall clock differently for a different cafe timezone', () => {
    expect(cafeLocalToUTC('2026-09-05', '19:00', 'UTC').toISOString())
      .toBe('2026-09-05T19:00:00.000Z');
    expect(cafeLocalToUTC('2026-09-05', '19:00', 'America/New_York').toISOString())
      .toBe('2026-09-05T23:00:00.000Z');
  });

  test('handles a slot on the far side of a DST transition', () => {
    // London is BST (+01:00) in September and GMT (+00:00) in December.
    expect(cafeLocalToUTC('2026-09-05', '19:00', 'Europe/London').toISOString())
      .toBe('2026-09-05T18:00:00.000Z');
    expect(cafeLocalToUTC('2026-12-05', '19:00', 'Europe/London').toISOString())
      .toBe('2026-12-05T19:00:00.000Z');
  });

  test('handles a midnight-adjacent slot without rolling the date', () => {
    expect(cafeLocalToUTC('2026-09-05', '00:30', 'Asia/Kolkata').toISOString())
      .toBe('2026-09-04T19:00:00.000Z');
  });

  test('falls back to the browser zone when the tenant carries no timezone', () => {
    const expected = cafeLocalToUTC(
      '2026-09-05',
      '19:00',
      Intl.DateTimeFormat().resolvedOptions().timeZone
    );
    expect(cafeLocalToUTC('2026-09-05', '19:00', undefined).toISOString())
      .toBe(expected.toISOString());
  });
});

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
