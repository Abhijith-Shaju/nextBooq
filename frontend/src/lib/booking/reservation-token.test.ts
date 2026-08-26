import { describe, expect, test } from 'vitest';
import { getReservationToken, matchesReservationToken } from './reservation-token';

describe('getReservationToken', () => {
  test('takes the last four characters of the id', () => {
    expect(getReservationToken({ _id: '6a89d0423db5e26083a9afea' })).toBe('AFEA');
  });

  test('uppercases, so the same booking never reads as two different tokens', () => {
    // The guest sees this on their phone and staff read it off a list — a
    // lowercase hex tail on one screen beside an uppercase one on another
    // looks like a mismatch at the door.
    expect(getReservationToken({ _id: '000000000000000000004a2f' })).toBe('4A2F');
  });

  test('falls back to id when _id is absent', () => {
    expect(getReservationToken({ id: 'abcdef123456' })).toBe('3456');
  });

  test('returns an empty token rather than throwing when there is no id', () => {
    expect(getReservationToken({})).toBe('');
  });
});

describe('matchesReservationToken', () => {
  const reservation = { _id: '6a89d0423db5e26083a9afea' }; // token AFEA

  test('matches the exact token', () => {
    expect(matchesReservationToken(reservation, 'AFEA')).toBe(true);
  });

  test('matches case-insensitively', () => {
    expect(matchesReservationToken(reservation, 'afea')).toBe(true);
  });

  test('tolerates the leading # the guest is shown', () => {
    expect(matchesReservationToken(reservation, '#AFEA')).toBe(true);
  });

  test('matches a partial token, so staff can type as they read', () => {
    expect(matchesReservationToken(reservation, 'AF')).toBe(true);
  });

  test('ignores surrounding whitespace', () => {
    expect(matchesReservationToken(reservation, '  afea ')).toBe(true);
  });

  test('does not match a different token', () => {
    expect(matchesReservationToken(reservation, 'B00B')).toBe(false);
  });

  test('an empty search term does not match everything', () => {
    // The caller treats empty as "no filter"; this must not silently claim a
    // token match, or an empty box would look like a token hit.
    expect(matchesReservationToken(reservation, '')).toBe(false);
    expect(matchesReservationToken(reservation, '   ')).toBe(false);
  });
});
