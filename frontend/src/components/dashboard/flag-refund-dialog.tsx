'use client';

import { useState } from 'react';
import { useMarkRefundOwed } from '@/hooks/host/use-refunds-owed';
import { getReservationGuestName } from '@/lib/dashboard/reservation-guest';
import { useModalDismiss } from '@/hooks/use-modal-dismiss';
import { Reservation } from '@/lib/types/models';
import { AlertCircle, Loader2, X } from 'lucide-react';

const formatAmount = (amount: number) =>
  Number.isInteger(amount) ? String(amount) : amount.toFixed(2);

/**
 * Records a refund the cafe has decided to make but the rules did not require
 * — a service complaint, a waived no-show, a booking taken under
 * non-refundable terms it wants to refund anyway.
 *
 * The reason is mandatory because nothing else on the reservation explains a
 * discretionary entry: whoever settles it later, possibly weeks on, needs to
 * know why the cafe agreed to pay before they pay it.
 */
export function FlagRefundDialog({
  reservation,
  cafeId,
  onClose,
}: {
  reservation: Reservation;
  cafeId: string | undefined;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const flag = useMarkRefundOwed(cafeId);
  const { onBackdropClick } = useModalDismiss(true, onClose);

  const guestName = getReservationGuestName(reservation);
  const amount = reservation.payment_data?.amount ?? 0;
  const resId = reservation._id || reservation.id;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Say why this refund is owed.');
      return;
    }
    setError(null);
    flag.mutate(
      { reservationId: resId, reason: reason.trim() },
      {
        onSuccess: onClose,
        onError: (err: unknown) => {
          const message =
            (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
              ?.error?.message || 'Could not flag this refund. Please try again.';
          setError(message);
        },
      }
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-brown/40 backdrop-blur-sm p-4"
      onClick={onBackdropClick}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="flag-refund-title"
        className="w-full max-w-md rounded-3xl bg-white shadow-brand-md border border-brand-brown/10 overflow-hidden"
      >
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <h2 id="flag-refund-title" className="font-display text-xl font-bold text-brand-brown">
              Flag refund owed
            </h2>
            <p className="text-xs text-brand-mochaMid mt-1">
              &#8377;{formatAmount(amount)} to {guestName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-brand-mocha hover:text-brand-brown"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 pb-6 pt-4 space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[12px] leading-relaxed text-amber-900">
              This adds the booking to <strong>Refunds owed</strong>. It does not send any money —
              refund the guest from Razorpay, then record it from that page.
            </p>
          </div>

          <div>
            <label
              htmlFor="refund-reason"
              className="block text-sm font-semibold text-brand-brown mb-1.5"
            >
              Why is this owed?
            </label>
            <textarea
              id="refund-reason"
              rows={3}
              autoFocus
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Kitchen closed early, guest could not be seated"
              className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm resize-none"
            />
            <p className="text-[11px] text-brand-mochaMid mt-1">
              Shown to whoever settles this, and kept on the audit trail.
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-xs font-semibold text-red-700">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-brand-brown/20 text-sm font-semibold text-brand-mocha hover:bg-brand-tan/30"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={flag.isPending}
              className="flex-1 cta-hero justify-center py-2.5 text-sm font-bold disabled:opacity-60"
            >
              {flag.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              Flag refund owed
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
