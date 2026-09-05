'use client';

import { useState } from 'react';
import { useTenant } from '@/components/providers/tenant-provider';
import { useAuth } from '@/components/providers/auth-provider';
import { hasCafePermission } from '@/lib/dashboard/tenant-membership';
import {
  useRefundsOwed,
  useRefundsSettled,
  useMarkRefundSettled,
  type RefundOwed,
} from '@/hooks/host/use-refunds-owed';
import { getReservationGuestName } from '@/lib/dashboard/reservation-guest';
import { useModalDismiss } from '@/hooks/use-modal-dismiss';
import { IndianRupee, CheckCircle2, Loader2, Lock, AlertCircle, X, History } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const formatAmount = (amount: number) =>
  Number.isInteger(amount) ? String(amount) : amount.toFixed(2);

/**
 * Confirms a refund the cafe has already made elsewhere.
 *
 * Worded carefully: nextBooq cannot move money out of the cafe's Razorpay
 * account, so this records a refund rather than issuing one. Someone who
 * believes this button pays the guest will leave people out of pocket with
 * the record saying they were paid.
 */
function SettleDialog({
  entry,
  cafeId,
  onClose,
}: {
  entry: RefundOwed;
  cafeId: string | undefined;
  onClose: () => void;
}) {
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const settle = useMarkRefundSettled(cafeId);
  const { onBackdropClick } = useModalDismiss(true, onClose);

  const guestName = getReservationGuestName({ user_id: entry.guest } as never);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reference.trim()) {
      setError('Enter the reference for the refund you made.');
      return;
    }
    setError(null);
    settle.mutate(
      { reservationId: entry._id, refundReference: reference.trim() },
      {
        onSuccess: onClose,
        onError: (err: unknown) => {
          const message =
            (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
              ?.error?.message || 'Could not record the refund. Please try again.';
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
        aria-labelledby="settle-title"
        className="w-full max-w-md rounded-3xl bg-white shadow-brand-md border border-brand-brown/10 overflow-hidden"
      >
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <h2 id="settle-title" className="font-display text-xl font-bold text-brand-brown">
              Record this refund
            </h2>
            <p className="text-xs text-brand-mochaMid mt-1">
              &#8377;{formatAmount(entry.amount)} to {guestName}
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
              This does <strong>not</strong> send any money. Refund the guest from your Razorpay
              account first, then record it here so the entry clears.
            </p>
          </div>

          <div>
            <label
              htmlFor="refund-reference"
              className="block text-sm font-semibold text-brand-brown mb-1.5"
            >
              Refund reference
            </label>
            <input
              id="refund-reference"
              type="text"
              autoFocus
              maxLength={100}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="rfnd_xxxxxxxxxxxx"
              className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm font-mono"
            />
            <p className="text-[11px] text-brand-mochaMid mt-1">
              The Razorpay refund id, or the reference of however you paid the guest back (UPI,
              bank transfer). Kept so the refund can be evidenced later.
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
              disabled={settle.isPending}
              className="flex-1 cta-hero justify-center py-2.5 text-sm font-bold disabled:opacity-60"
            >
              {settle.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              Record refund
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RefundsOwedPage() {
  const { cafe } = useTenant();
  const { user } = useAuth();
  const [settling, setSettling] = useState<RefundOwed | null>(null);
  const [tab, setTab] = useState<'owed' | 'settled'>('owed');

  const canSettle = hasCafePermission(user, cafe.id, 'manage_billing');
  const { data: refunds = [], isLoading, isError } = useRefundsOwed(cafe?.id);
  // History is only fetched once someone opens the tab -- the owed queue is
  // the working view and this is a lookup nobody needs loaded by default.
  const {
    data: settled = [],
    isLoading: settledLoading,
    isError: settledError,
  } = useRefundsSettled(cafe?.id, tab === 'settled');

  const total = refunds.reduce((sum, r) => sum + (r.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/70 backdrop-blur-sm p-5 rounded-2xl border border-brand-brown/10">
        <div>
          <h1 className="text-2xl font-bold font-display text-brand-brown">Refunds</h1>
          <p className="text-xs text-brand-mochaMid mt-0.5">
            Guests waiting to be paid back, and the ones you have already settled. nextBooq never
            holds your money, so refunds come from your own Razorpay account.
          </p>
        </div>
        {refunds.length > 0 ? (
          <div className="shrink-0 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2 text-center">
            <p className="font-mono text-lg font-bold text-amber-900 tabular-nums">
              &#8377;{formatAmount(total)}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              {refunds.length} outstanding
            </p>
          </div>
        ) : null}
      </div>

      {!canSettle ? (
        <p className="flex items-center gap-2 text-xs text-brand-mochaMid px-1">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          You can see what is owed, but marking a refund as paid needs billing access.
        </p>
      ) : null}

      <div className="flex gap-1 border-b border-brand-brown/10" role="tablist">
        {([
          ['owed', `Owed${refunds.length ? ` (${refunds.length})` : ''}`],
          ['settled', 'Settled'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-brand-red text-brand-brown'
                : 'border-transparent text-brand-mocha hover:text-brand-brown'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'settled' ? (
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-brand-brown/10 overflow-hidden">
          {settledLoading ? (
            <p className="p-8 text-center text-sm text-brand-mochaMid">Loading history…</p>
          ) : settledError ? (
            <p className="p-8 text-center text-sm text-red-700">
              Could not load the refund history. Please refresh.
            </p>
          ) : settled.length === 0 ? (
            <div className="p-10 text-center">
              <History className="w-8 h-8 text-brand-mochaMid mx-auto mb-3" />
              <p className="font-semibold text-brand-brown">No refunds recorded yet</p>
              <p className="text-xs text-brand-mochaMid mt-1">
                Refunds you mark as paid will be listed here with their reference.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[640px]">
                <thead className="bg-brand-tan/40 text-brand-mocha">
                  <tr>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide">Guest</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide">Refunded</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide">Reference</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {settled.map((r) => (
                    <tr key={r._id} className="border-t border-brand-brown/10">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-brand-brown">
                          {getReservationGuestName({ user_id: r.guest } as never)}
                        </p>
                        <p className="text-[11px] text-brand-mochaMid">
                          {typeof r.guest === 'object' && r.guest?.email ? r.guest.email : '—'}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-xs text-brand-mocha whitespace-nowrap">
                        {r.refund_settled_at
                          ? format(parseISO(r.refund_settled_at), 'd MMM yyyy, HH:mm')
                          : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-[11px] text-brand-brown break-all">
                          {r.refund_reference || '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono font-bold text-brand-brown tabular-nums whitespace-nowrap">
                        <IndianRupee className="w-3.5 h-3.5 inline -mt-0.5" />
                        {formatAmount(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-5 py-3 text-[11px] text-brand-mochaMid border-t border-brand-brown/10">
                Showing the 50 most recent. The reference is what evidences the refund if a guest
                ever queries it.
              </p>
            </div>
          )}
        </div>
      ) : (
      <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-brand-brown/10 overflow-hidden">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-brand-mochaMid">Loading refunds…</p>
        ) : isError ? (
          <p className="p-8 text-center text-sm text-red-700">
            Could not load the refunds queue. Please refresh.
          </p>
        ) : refunds.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-3" />
            <p className="font-semibold text-brand-brown">Nothing owed</p>
            <p className="text-xs text-brand-mochaMid mt-1">
              Cancelled bookings that need refunding will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[640px]">
              <thead className="bg-brand-tan/40 text-brand-mocha">
                <tr>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide">Guest</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide">Booking</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide">Payment</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide">Amount</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {refunds.map((r) => (
                  <tr key={r._id} className="border-t border-brand-brown/10">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-brand-brown">
                        {getReservationGuestName({ user_id: r.guest } as never)}
                      </p>
                      <p className="text-[11px] text-brand-mochaMid">
                        {typeof r.guest === 'object' && r.guest?.email ? r.guest.email : '—'}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-xs text-brand-mocha">
                      {r.start_time ? format(parseISO(r.start_time), 'd MMM, HH:mm') : '—'}
                      <span className="block text-[11px] text-brand-mochaMid">
                        {r.status.replace(/_/g, ' ').toLowerCase()}
                      </span>
                      {/* Only set when a human put this on the queue. The
                          automatic paths explain themselves from the status,
                          but a discretionary entry does not -- whoever pays it
                          needs to know why the cafe agreed to. */}
                      {r.refund_reason ? (
                        <span className="mt-1 block max-w-[26ch] text-[11px] italic text-brand-mocha">
                          “{r.refund_reason}”
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-[11px] text-brand-mocha break-all">
                        {r.payment_id || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono font-bold text-brand-brown tabular-nums whitespace-nowrap">
                      <IndianRupee className="w-3.5 h-3.5 inline -mt-0.5" />
                      {formatAmount(r.amount)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {canSettle ? (
                        <button
                          type="button"
                          onClick={() => setSettling(r)}
                          className="tone-neutral py-2 px-3 rounded-xl text-xs font-semibold hover:opacity-80 whitespace-nowrap"
                        >
                          Mark refunded
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {settling ? (
        <SettleDialog entry={settling} cafeId={cafe?.id} onClose={() => setSettling(null)} />
      ) : null}
    </div>
  );
}
