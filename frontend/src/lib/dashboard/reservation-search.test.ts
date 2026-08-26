import { describe, expect, test } from 'vitest';
import { matchesReservationSearch } from './reservation-search';
import type { Reservation } from '@/lib/types/models';

const ada = {
  _id: 'aaaa1111bbbb2222cccc3333', // token 3333
  status: 'CONFIRMED',
  party_size: 2,
  start_time: '2026-09-05T19:00:00.000Z',
  __v: 0,
  user_id: { _id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', phone: '+91 98765 43210' },
} as unknown as Reservation;

describe('matchesReservationSearch', () => {
  test('an empty term matches everything, since callers treat it as no filter', () => {
    expect(matchesReservationSearch(ada, '')).toBe(true);
    expect(matchesReservationSearch(ada, '   ')).toBe(true);
  });

  test('matches the token the guest quotes, with or without the leading #', () => {
    expect(matchesReservationSearch(ada, '3333')).toBe(true);
    expect(matchesReservationSearch(ada, '#3333')).toBe(true);
  });

  test('matches the guest name case-insensitively', () => {
    expect(matchesReservationSearch(ada, 'ada')).toBe(true);
    expect(matchesReservationSearch(ada, 'LOVELACE')).toBe(true);
  });

  test('matches the email', () => {
    expect(matchesReservationSearch(ada, 'ada@example')).toBe(true);
  });

  test('matches a phone typed without the spacing or country code it is stored with', () => {
    expect(matchesReservationSearch(ada, '9876543210')).toBe(true);
    expect(matchesReservationSearch(ada, '98765 43210')).toBe(true);
  });

  test('does not match an unrelated term', () => {
    expect(matchesReservationSearch(ada, 'zzz')).toBe(false);
    expect(matchesReservationSearch(ada, '5555')).toBe(false);
  });

  test('a guest with no populated user record still searches by token without throwing', () => {
    const walkIn = { _id: 'aaaa1111bbbb2222cccc4444', status: 'SEATED', party_size: 1, __v: 0 } as unknown as Reservation;

    expect(matchesReservationSearch(walkIn, '4444')).toBe(true);
    expect(matchesReservationSearch(walkIn, '9876543210')).toBe(false);
  });
});
