'use client';

import { Reservation } from '@/lib/types/models';
import { StatusBadge } from '@/components/shared/status-badge';
import { useModalDismiss } from '@/hooks/use-modal-dismiss';
import { getReservationToken } from '@/lib/booking/reservation-token';
import { getReservationTableNumbers } from '@/lib/dashboard/reservation-tables';
import { describeReservationStatus } from '@/lib/booking/reservation-status';
import { format, parseISO } from 'date-fns';
import { X, Calendar, Clock, Users, Hash } from 'lucide-react';

interface ReservationDetailModalProps {
  reservation: Reservation | null;
  cafeName: string;
  onClose: () => void;
  onCompletePayment?: (reservation: Reservation) => void;
}

// Once a booking reaches one of these it is over, so the token is history
// rather than something to present at the door.
const SPENT_STATUSES: Reservation['status'][] = [
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'NO_SHOW',
  'LEFT_BEFORE_SEATING',
];

export function ReservationDetailModal({
  reservation,
  cafeName,
  onClose,
  onCompletePayment,
}: ReservationDetailModalProps) {
  const { onBackdropClick } = useModalDismiss(reservation !== null, onClose);

  if (!reservation) return null;

  const token = getReservationToken(reservation);
  const startDate = parseISO(reservation.start_time);
  const tableNumbers = getReservationTableNumbers(reservation).join(', ');
  const isSpent = SPENT_STATUSES.includes(reservation.status);
  const { label } = describeReservationStatus(reservation.status);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-xs"
      onClick={onBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Booking ${token} at ${cafeName}`}
    >
      <div className="ticket-card w-full max-w-sm animate-scale-in">
        <div className="flex items-start justify-between px-5 pt-5">
          <div>
            <h2 className="font-display text-lg font-bold text-brand-brown">{cafeName}</h2>
            <p className="mt-0.5 text-xs text-brand-mocha">{label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close booking details"
            className="rounded-full p-2 text-brand-mocha transition-colors hover:bg-brand-tan/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={`flex flex-col items-center gap-2 px-5 pb-6 pt-4 ${isSpent ? 'opacity-60' : ''}`}>
          <StatusBadge status={reservation.status} />
          <span className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-brand-mochaMid">
            {isSpent ? 'Token' : 'Show this token at the door'}
          </span>
          <div className="font-mono text-4xl font-bold tracking-[0.12em] text-brand-brown tabular-nums">
            #{token}
          </div>
        </div>

        <div className="ticket-perf" />

        <div className="ticket-field grid grid-cols-3 gap-3 p-5">
          <div>
            <div className="k">Date</div>
            <div className="v mt-0.5 flex items-center gap-1 text-[15px]">
              <Calendar className="h-3.5 w-3.5 text-brand-red" />
              {format(startDate, 'EEE d MMM')}
            </div>
          </div>
          <div>
            <div className="k">Time</div>
            <div className="v mt-0.5 flex items-center gap-1 text-[15px]">
              <Clock className="h-3.5 w-3.5 text-brand-red" />
              {format(startDate, 'h:mm a')}
            </div>
          </div>
          <div>
            <div className="k">Party</div>
            <div className="v mt-0.5 flex items-center gap-1 text-[15px]">
              <Users className="h-3.5 w-3.5 text-brand-red" />
              {reservation.party_size}
            </div>
          </div>
        </div>

        {tableNumbers && (
          <div className="flex items-center gap-1.5 px-5 pb-4 font-mono text-xs text-brand-mocha">
            <Hash className="h-3.5 w-3.5 text-brand-red" />
            Table {tableNumbers}
          </div>
        )}

        {reservation.status === 'PENDING_PAYMENT' && onCompletePayment && (
          <div className="px-5 pb-5">
            <button
              type="button"
              onClick={() => onCompletePayment(reservation)}
              className="cta-hero w-full justify-center py-3 text-xs font-bold shadow-brand-sm"
            >
              Complete Payment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
