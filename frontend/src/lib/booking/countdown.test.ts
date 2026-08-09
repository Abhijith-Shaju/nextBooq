import { describe, expect, test } from 'vitest';
import { formatCountdown, secondsUntil, isExpired } from './countdown';

describe('secondsUntil', () => {
  test('returns whole seconds remaining between now and a future time', () => {
    const now = new Date('2026-08-10T19:00:00.000Z');
    const expiresAt = new Date('2026-08-10T19:05:00.000Z');
    expect(secondsUntil(expiresAt, now)).toBe(300);
  });

  test('clamps to zero once the expiry has passed', () => {
    const now = new Date('2026-08-10T19:06:00.000Z');
    const expiresAt = new Date('2026-08-10T19:05:00.000Z');
    expect(secondsUntil(expiresAt, now)).toBe(0);
  });
});

describe('formatCountdown', () => {
  test('formats whole minutes and seconds as mm:ss', () => {
    expect(formatCountdown(298)).toBe('04:58');
  });

  test('pads single-digit minutes and seconds', () => {
    expect(formatCountdown(65)).toBe('01:05');
  });

  test('never renders negative time', () => {
    expect(formatCountdown(-10)).toBe('00:00');
  });
});

describe('isExpired', () => {
  test('is false while time remains', () => {
    const now = new Date('2026-08-10T19:00:00.000Z');
    const expiresAt = new Date('2026-08-10T19:05:00.000Z');
    expect(isExpired(expiresAt, now)).toBe(false);
  });

  test('is true exactly at expiry', () => {
    const now = new Date('2026-08-10T19:05:00.000Z');
    const expiresAt = new Date('2026-08-10T19:05:00.000Z');
    expect(isExpired(expiresAt, now)).toBe(true);
  });

  test('is true after expiry', () => {
    const now = new Date('2026-08-10T19:06:00.000Z');
    const expiresAt = new Date('2026-08-10T19:05:00.000Z');
    expect(isExpired(expiresAt, now)).toBe(true);
  });
});
