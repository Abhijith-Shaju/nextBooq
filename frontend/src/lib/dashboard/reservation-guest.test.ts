import { describe, expect, test } from 'vitest';
import { getReservationGuestName, getReservationGuestEmail, getReservationGuestPhone } from './reservation-guest';
import type { Reservation } from '@/lib/types/models';

const baseReservation: Reservation = {
  id: 'r1',
  cafe_id: 'cafe1',
  start_time: '2026-08-10T13:30:00.000Z',
  end_time: '2026-08-10T15:00:00.000Z',
  party_size: 2,
  status: 'CONFIRMED',
  __v: 0,
};

describe('getReservationGuestName', () => {
  test('reads the name from a populated user_id (real API shape)', () => {
    const reservation: Reservation = {
      ...baseReservation,
      user_id: { _id: 'u1', name: 'Priya Sharma', email: 'priya@test.com', phone: '+91900000' },
    };
    expect(getReservationGuestName(reservation)).toBe('Priya Sharma');
  });

  test('falls back to "Guest" when user_id is an unpopulated id string', () => {
    const reservation: Reservation = { ...baseReservation, user_id: 'u1' };
    expect(getReservationGuestName(reservation)).toBe('Guest');
  });

  test('falls back to "Guest" when user_id is missing entirely', () => {
    expect(getReservationGuestName(baseReservation)).toBe('Guest');
  });
});

describe('getReservationGuestEmail / getReservationGuestPhone', () => {
  test('read contact details from a populated user_id', () => {
    const reservation: Reservation = {
      ...baseReservation,
      user_id: { _id: 'u1', name: 'Priya Sharma', email: 'priya@test.com', phone: '+91900000' },
    };
    expect(getReservationGuestEmail(reservation)).toBe('priya@test.com');
    expect(getReservationGuestPhone(reservation)).toBe('+91900000');
  });

  test('return null when user_id is unpopulated or missing', () => {
    expect(getReservationGuestEmail({ ...baseReservation, user_id: 'u1' })).toBeNull();
    expect(getReservationGuestPhone(baseReservation)).toBeNull();
  });
});
