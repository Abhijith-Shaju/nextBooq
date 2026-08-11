'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { useCafeSubscriptions } from '@/hooks/admin/use-cafe-subscriptions';
import { useRecordSubscriptionTerm } from '@/hooks/admin/use-record-subscription-term';
import { useSetSubscriptionStatus } from '@/hooks/admin/use-set-subscription-status';
import { SubscriptionTermMonths, SubscriptionStatus } from '@/lib/types/models';

const TERM_OPTIONS: { value: SubscriptionTermMonths; label: string; defaultPrice: number }[] = [
  { value: 1, label: 'Monthly', defaultPrice: 9000 },
  { value: 6, label: '6 months', defaultPrice: 8000 },
  { value: 12, label: '12 months', defaultPrice: 7000 },
  { value: 18, label: '18 months', defaultPrice: 6000 },
];

const STATUS_ACTIONS: { value: SubscriptionStatus; label: string }[] = [
  { value: 'trial', label: 'Trial' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Disable' },
];

interface SubscriptionDrawerProps {
  cafeId: string | null;
  orgId: string | undefined;
  onClose: () => void;
}

export function SubscriptionDrawer({ cafeId, orgId, onClose }: SubscriptionDrawerProps) {
  const { data: history = [] } = useCafeSubscriptions(cafeId);
  const recordTerm = useRecordSubscriptionTerm(cafeId);
  const setStatus = useSetSubscriptionStatus(cafeId);

  const [termMonths, setTermMonths] = useState<SubscriptionTermMonths>(1);
  const [pricePerMonth, setPricePerMonth] = useState<number>(9000);
  const [note, setNote] = useState('');

  if (!cafeId) return null;

  const current = history.find((sub) => sub.is_current) || history[0] || null;
  const hasConfiguredPlan = history.length > 0;

  const handleTermChange = (value: SubscriptionTermMonths) => {
    setTermMonths(value);
    const option = TERM_OPTIONS.find((o) => o.value === value);
    if (option) setPricePerMonth(option.defaultPrice);
  };

  const handleSubmitTerm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    recordTerm.mutate({ org_id: orgId, term_months: termMonths, price_per_month: pricePerMonth, note });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold">Subscription</h2>
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-900">
            Close
          </button>
        </div>

        {!hasConfiguredPlan && (
          <p className="mb-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
            No plan set for this cafe yet — record its first term below.
          </p>
        )}

        {hasConfiguredPlan && current && (
          <div className="mb-6 space-y-2">
            <p className="text-sm text-slate-600">
              Current: {current.term_months} mo @ ₹{current.price_per_month}/mo — status {current.status}
            </p>
            <div className="flex gap-2">
              {STATUS_ACTIONS.map((action) => (
                <button
                  key={action.value}
                  onClick={() => setStatus.mutate({ status: action.value })}
                  disabled={setStatus.isPending}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmitTerm} className="mb-6 space-y-3 rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-bold">Record payment / renew</h3>
          <div>
            <label htmlFor="term-select" className="block text-xs font-medium text-slate-600">
              Term
            </label>
            <select
              id="term-select"
              aria-label="Term"
              value={termMonths}
              onChange={(e) => handleTermChange(Number(e.target.value) as SubscriptionTermMonths)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {TERM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="price-input" className="block text-xs font-medium text-slate-600">
              Price per month (₹)
            </label>
            <input
              id="price-input"
              aria-label="Price per month"
              type="number"
              min={0}
              value={pricePerMonth}
              onChange={(e) => setPricePerMonth(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="note-input" className="block text-xs font-medium text-slate-600">
              Note (optional)
            </label>
            <input
              id="note-input"
              aria-label="Note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Paid via UPI on Aug 11"
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={recordTerm.isPending || !orgId}
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Record payment
          </button>
        </form>

        <div>
          <h3 className="mb-2 text-sm font-bold">History</h3>
          <ul className="space-y-2 text-sm text-slate-600">
            {history.map((sub) => (
              <li key={sub._id} className="rounded-md border border-slate-100 p-2">
                {sub.term_months} mo @ ₹{sub.price_per_month}/mo — {sub.status} — since{' '}
                {format(new Date(sub.period_start), 'MMM d, yyyy')}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
