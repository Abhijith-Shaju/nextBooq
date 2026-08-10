import { describe, expect, test } from 'vitest';
import {
  DAY_ORDER,
  DAY_LABELS,
  getDefaultOperatingHours,
  mergeOperatingHours,
  validateOperatingHoursForSubmit,
  OperatingHourEntry,
} from './operating-hours';

describe('DAY_ORDER / DAY_LABELS', () => {
  test('lists all 7 days, Monday first', () => {
    expect(DAY_ORDER).toEqual([
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ]);
  });

  test('has a human label for every day', () => {
    for (const day of DAY_ORDER) {
      expect(DAY_LABELS[day]).toBeTruthy();
    }
  });
});

describe('getDefaultOperatingHours', () => {
  test('returns all 7 days, open 09:00-22:00, none closed', () => {
    const hours = getDefaultOperatingHours();
    expect(hours).toHaveLength(7);
    expect(hours.every((h) => h.open_time === '09:00' && h.close_time === '22:00' && !h.is_closed)).toBe(true);
    expect(hours.map((h) => h.day_of_week)).toEqual(DAY_ORDER);
  });
});

describe('mergeOperatingHours', () => {
  test('fills in missing days with the default and orders Monday-first', () => {
    const stored: OperatingHourEntry[] = [
      { day_of_week: 'wednesday', open_time: '08:00', close_time: '18:00', is_closed: false },
      { day_of_week: 'monday', open_time: '10:00', close_time: '20:00', is_closed: false },
    ];

    const merged = mergeOperatingHours(stored);

    expect(merged.map((h) => h.day_of_week)).toEqual(DAY_ORDER);
    expect(merged.find((h) => h.day_of_week === 'monday')).toEqual(stored[1]);
    expect(merged.find((h) => h.day_of_week === 'tuesday')).toMatchObject({ open_time: '09:00', close_time: '22:00' });
  });

  test('returns the full default week when nothing is stored', () => {
    expect(mergeOperatingHours(undefined)).toEqual(getDefaultOperatingHours());
    expect(mergeOperatingHours([])).toEqual(getDefaultOperatingHours());
  });
});

describe('validateOperatingHoursForSubmit', () => {
  test('returns null (valid) for a normal week', () => {
    expect(validateOperatingHoursForSubmit(getDefaultOperatingHours())).toBeNull();
  });

  test('returns an error message when close_time is at or before open_time on an open day', () => {
    const hours = getDefaultOperatingHours().map((h) =>
      h.day_of_week === 'friday' ? { ...h, open_time: '20:00', close_time: '09:00' } : h
    );
    expect(validateOperatingHoursForSubmit(hours)).toMatch(/friday/i);
  });

  test('ignores an inverted range on a day marked closed', () => {
    const hours = getDefaultOperatingHours().map((h) =>
      h.day_of_week === 'friday' ? { ...h, open_time: '20:00', close_time: '09:00', is_closed: true } : h
    );
    expect(validateOperatingHoursForSubmit(hours)).toBeNull();
  });
});
