import { describe, expect, test } from 'vitest';
import { stepPartySize } from './party-size';

describe('stepPartySize', () => {
  test('increments within range', () => {
    expect(stepPartySize(2, 1, 12)).toBe(3);
  });

  test('decrements within range', () => {
    expect(stepPartySize(2, -1, 12)).toBe(1);
  });

  test('does not increment past max', () => {
    expect(stepPartySize(12, 1, 12)).toBe(12);
  });

  test('does not decrement below min (default 1)', () => {
    expect(stepPartySize(1, -1, 12)).toBe(1);
  });

  test('clamps down immediately when max shrinks below current value', () => {
    expect(stepPartySize(8, 1, 6)).toBe(6);
  });
});
