import type { Reservation } from '@/lib/types/models';

/**
 * Statuses a booking ends in. Everything else still needs something from the
 * host — a table, a check-in, a nudge about payment — so it belongs at the
 * top of the list during service.
 */
const SETTLED_STATUSES = new Set<Reservation['status']>([
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'NO_SHOW',
  'LEFT_BEFORE_SEATING',
]);

export function isPendingReservation(reservation: Reservation): boolean {
  return !SETTLED_STATUSES.has(reservation.status);
}

const startedAt = (reservation: Reservation): number => {
  const parsed = reservation.start_time ? Date.parse(reservation.start_time) : NaN;
  // A booking with no usable time sorts last within its group rather than
  // scrambling the order around it.
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};

/**
 * Orders the host stand manifest: everything still open first, then the
 * bookings that are already done, each group earliest-first.
 *
 * Returns a new array — the manifest comes straight from the query cache and
 * must not be sorted in place.
 */
export function sortManifestReservations(reservations: Reservation[]): Reservation[] {
  return [...reservations].sort((a, b) => {
    const pendingDelta = Number(isPendingReservation(b)) - Number(isPendingReservation(a));
    if (pendingDelta !== 0) return pendingDelta;
    return startedAt(a) - startedAt(b);
  });
}
