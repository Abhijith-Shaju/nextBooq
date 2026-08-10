import type { Reservation, ReservationTableRef, Table } from '@/lib/types/models';

const refId = (ref: ReservationTableRef): string | null => {
  if (typeof ref === 'string') return ref;
  return ref._id || ref.id || null;
};

/**
 * IDs of every table backing a reservation. A reservation can span more than
 * one table (merged tables for a large party) — table_ids is always an array,
 * never a single flat table reference.
 */
export function getReservationTableIds(reservation: Reservation): string[] {
  return (reservation.table_ids || [])
    .map(refId)
    .filter((id): id is string => Boolean(id));
}

/**
 * Human-readable table numbers ("3", "4") for display. Only meaningful when
 * table_ids is populated (host manifest / customer reservations endpoints
 * populate it; other responses may return bare id strings, which have no
 * table_number to show).
 */
export function getReservationTableNumbers(reservation: Reservation): string[] {
  return (reservation.table_ids || [])
    .map((ref) => (typeof ref === 'string' ? null : ref.table_number))
    .filter((n): n is string => Boolean(n));
}

const tableId = (table: Table): string | null => table.id || table._id || null;

export function isTableAssignedToReservation(table: Table, reservation: Reservation): boolean {
  const id = tableId(table);
  if (!id) return false;
  return getReservationTableIds(reservation).includes(id);
}
