import { Reservation } from '@/lib/types/models';

export interface ShiftMetrics {
  totalCovers: number;
  seatedCovers: number;
  expectedCovers: number;
}

export function computeShiftMetrics(reservations: Reservation[]): ShiftMetrics {
  const totalCovers = reservations.reduce((acc, r) => acc + (r.party_size || 0), 0);
  const seatedCovers = reservations
    .filter((r) => r.status === 'SEATED')
    .reduce((acc, r) => acc + (r.party_size || 0), 0);
  const expectedCovers = reservations
    .filter((r) => r.status === 'CONFIRMED' || r.status === 'CHECKED_IN')
    .reduce((acc, r) => acc + (r.party_size || 0), 0);

  return { totalCovers, seatedCovers, expectedCovers };
}
