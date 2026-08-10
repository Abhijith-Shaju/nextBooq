import type { Reservation } from '@/lib/types/models';

const populatedUser = (reservation: Reservation) => {
  const { user_id } = reservation;
  if (!user_id || typeof user_id === 'string') return null;
  return user_id;
};

export function getReservationGuestName(reservation: Reservation): string {
  return populatedUser(reservation)?.name || 'Guest';
}

export function getReservationGuestEmail(reservation: Reservation): string | null {
  return populatedUser(reservation)?.email || null;
}

export function getReservationGuestPhone(reservation: Reservation): string | null {
  return populatedUser(reservation)?.phone || null;
}
