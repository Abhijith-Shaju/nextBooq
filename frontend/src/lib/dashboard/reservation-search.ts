import type { Reservation } from '@/lib/types/models';
import { matchesReservationToken } from '@/lib/booking/reservation-token';
import {
  getReservationGuestName,
  getReservationGuestEmail,
  getReservationGuestPhone,
} from '@/lib/dashboard/reservation-guest';

/**
 * True when `term` looks like it is aiming at this reservation.
 *
 * Staff search for whatever the guest in front of them happens to say: the
 * token off their phone, their name, or the number they booked with. All
 * three go through here so the host stand and the history page can never
 * drift into finding different things for the same query.
 *
 * An empty term matches everything — callers treat it as "no filter".
 */
export function matchesReservationSearch(reservation: Reservation, term: string): boolean {
  const normalized = term.trim().toLowerCase();
  if (normalized.length === 0) return true;

  const name = getReservationGuestName(reservation).toLowerCase();
  const email = (getReservationGuestEmail(reservation) || '').toLowerCase();
  // Digits only, so "+91 98765 43210" is still found by typing "9876543210".
  const phone = (getReservationGuestPhone(reservation) || '').replace(/\D/g, '');
  const digits = normalized.replace(/\D/g, '');

  return (
    matchesReservationToken(reservation, term) ||
    name.includes(normalized) ||
    email.includes(normalized) ||
    (digits.length > 0 && phone.includes(digits))
  );
}
