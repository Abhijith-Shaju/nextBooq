import { describe, expect, test } from 'vitest';
import { describeSlot } from './slot';

describe('describeSlot', () => {
  test('an available slot is selectable and shows the hold duration', () => {
    expect(describeSlot({ time: '19:00', available: true }, 90)).toEqual({
      label: '19:00',
      sublabel: '90 min hold',
      selectable: true,
    });
  });

  test('an unavailable slot is not selectable and reads sold out', () => {
    expect(describeSlot({ time: '18:30', available: false }, 90)).toEqual({
      label: '18:30',
      sublabel: 'Sold out',
      selectable: false,
    });
  });

  test('rounds a fractional hold duration to the nearest minute', () => {
    expect(describeSlot({ time: '20:00', available: true }, 45.6)).toEqual({
      label: '20:00',
      sublabel: '46 min hold',
      selectable: true,
    });
  });
});
