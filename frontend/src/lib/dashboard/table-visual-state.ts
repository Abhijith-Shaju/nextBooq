import { Reservation, Table } from '@/lib/types/models';
import { isTableAssignedToReservation } from './reservation-tables';

export type TableTone = 'out-of-service' | 'empty' | 'reserved-soon' | 'seated';

export interface TableVisualState {
  tone: TableTone;
  assignedReservation: Reservation | null;
}

const OCCUPYING_STATUSES = new Set<Reservation['status']>([
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CHECKED_IN',
  'SEATED',
]);

export function resolveTableVisualState(table: Table, reservations: Reservation[]): TableVisualState {
  if (table.status === 'out_of_service') {
    return { tone: 'out-of-service', assignedReservation: null };
  }

  const assignedReservation =
    reservations.find(
      (r) => isTableAssignedToReservation(table, r) && OCCUPYING_STATUSES.has(r.status)
    ) ?? null;

  if (!assignedReservation) {
    return { tone: 'empty', assignedReservation: null };
  }

  return {
    tone: assignedReservation.status === 'SEATED' ? 'seated' : 'reserved-soon',
    assignedReservation,
  };
}
