'use client';

import { useState } from 'react';
import { Reservation } from '@/lib/types/models';
import { StatusBadge } from '@/components/shared/status-badge';
import { useModalDismiss } from '@/hooks/use-modal-dismiss';
import { useCancelReservation } from '@/hooks/customer/use-cancel-reservation';
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

// A guest can call off a booking right up until they are at the cafe. Once
// they have checked in or been seated it is the cafe's to settle, not the
// app's — the terms say to speak to them, and the endpoint refuses too.
const CANCELLABLE_STATUSES: Reservation['status'][] = ['HOLD', 'PENDING_PAYMENT', 'CONFIRMED'];

export function ReservationDetailModal({
  reservation,
  cafeName,
  onClose,
  onCompletePayment,
}: ReservationDetailModalProps) {
  const { onBackdropClick } = useModalDismiss(reservation !== null, onClose);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelReservation = useCancelReservation();

  const reservationId = String(reservation?._id || reservation?.id || '');

  // Mirrors the server's rule in wording only, never in the decision: this
  // says what the cafe asks for and whether this cancellation meets it, and
  // the server still decides what actually happens to the money.
  const feeNotice = (() => {
    if (!reservation) return null;
    const amount = reservation.payment_data?.amount ?? 0;
    if (!reservation.payment_data?.payment_id || amount <= 0) return null;

    const fee = `₹${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
    if (reservation.fee_policy?.refund_on_cancellation === false) {
      return `Your ${fee} fee is non-refundable on this booking.`;
    }

    const cutoff = reservation.fee_policy?.cancellation_cutoff_hours ?? 24;
    const hoursOfNotice =
      (new Date(reservation.start_time).getTime() - Date.now()) / (60 * 60 * 1000);

    return hoursOfNotice >= cutoff
      ? `${cafeName} asks for ${cutoff} hours' notice for a refund. You are within that, so your ${fee} fee should come back to you.`
      : `${cafeName} asks for ${cutoff} hours' notice for a refund. This booking is sooner than that, so your ${fee} fee will not be returned.`;
  })();

  const handleCancel = () => {
    setError(null);
    cancelReservation.mutate(reservationId, {
      onSuccess: onClose,
      onError: (err: unknown) => {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Could not cancel this booking. Please try again, or contact the cafe.';
        setError(message);
      },
    });
  };

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
          <div className="px-5 pb-3">
            <button
              type="button"
              onClick={() => onCompletePayment(reservation)}
              className="cta-hero w-full justify-center py-3 text-xs font-bold shadow-brand-sm"
            >
              Complete Payment
            </button>
          </div>
        )}

        {CANCELLABLE_STATUSES.includes(reservation.status) ? (
          <div className="px-5 pb-5 pt-2">
            {confirming ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2.5">
                <p className="text-[12px] leading-relaxed text-red-900">
                  Cancel this booking? The table is released immediately and this cannot be
                  undone.
                </p>
                {/* The cutoff is on the booking already, so the guest can be
                    told what the rule is and whether they meet it — which is
                    the one thing worth knowing before deciding, and far more
                    use than "it depends on the terms". */}
                {feeNotice ? (
                  <p className="text-[12px] leading-relaxed text-red-900">{feeNotice}</p>
                ) : null}
                {error ? (
                  <p role="alert" className="text-[12px] font-semibold text-red-800">
                    {error}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(false);
                      setError(null);
                    }}
                    className="flex-1 rounded-lg border border-brand-brown/20 py-2 text-[12px] font-semibold text-brand-mocha hover:bg-white"
                  >
                    Keep booking
                  </button>
                  <button
                    type="button"
                    disabled={cancelReservation.isPending}
                    onClick={handleCancel}
                    className="flex-1 rounded-lg bg-red-600 py-2 text-[12px] font-bold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {cancelReservation.isPending ? 'Cancelling…' : 'Yes, cancel'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="w-full rounded-xl border border-brand-brown/20 py-2.5 text-[12px] font-semibold text-brand-mocha hover:border-red-300 hover:text-red-700"
              >
                Cancel this booking
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
