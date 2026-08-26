/**
 * Anything carrying a reservation id. Deliberately looser than `Reservation`
 * so callers that only hold an id — the checkout store, for one — can derive
 * the token without inventing the rest of the shape.
 */
type ReservationRef = { _id?: string; id?: string };

/**
 * The short reference a guest is told to quote at the door.
 *
 * It is derived from the tail of the reservation id rather than stored, so
 * every surface has to derive it the same way or staff will be hunting for a
 * token that doesn't match what the guest is holding. Uppercased because the
 * id is hex and `4a2f` on one screen next to `4A2F` on another reads as two
 * different bookings.
 */
export function getReservationToken(reservation: ReservationRef): string {
  const id = String(reservation._id || reservation.id || '');
  return id.slice(-4).toUpperCase();
}

/**
 * True when `term` looks like it is aiming at this reservation's token.
 * Case-insensitive, and tolerant of a leading "#" since that is how the token
 * is displayed to the guest.
 */
export function matchesReservationToken(
  reservation: ReservationRef,
  term: string
): boolean {
  const normalized = term.trim().replace(/^#/, '').toUpperCase();
  if (normalized.length === 0) return false;
  return getReservationToken(reservation).includes(normalized);
}
