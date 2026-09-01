'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import type { SubscriptionTermMonths } from '@/lib/types/models';
import type { CafeApplicationDetail } from '@/lib/types/cafe-application';
import { useApproveCafeApplication, useRejectCafeApplication } from '@/hooks/admin/use-review-cafe-application';
import { TERM_OPTIONS } from './cafe-onboarding-form';
import { apiMessage } from '@/lib/api-message';

interface CafeApplicationReviewProps {
  application: CafeApplicationDetail;
}

export function CafeApplicationReview({ application }: CafeApplicationReviewProps) {
  const router = useRouter();
  const approve = useApproveCafeApplication();
  const reject = useRejectCafeApplication();

  const [subscriptionStatus, setSubscriptionStatus] = useState<'active' | 'trial'>('active');
  const [termMonths, setTermMonths] = useState<SubscriptionTermMonths>(12);
  const [pricePerMonth, setPricePerMonth] = useState(7000);
  const [note, setNote] = useState('');

  const [rejectNote, setRejectNote] = useState('');
  const [rejectError, setRejectError] = useState('');

  const address = application.address;
  const isPending = application.status === 'pending';

  const STATUS_LABELS: Record<CafeApplicationDetail['status'], string> = {
    pending: 'Pending review',
    approved: 'Approved',
    rejected: 'Rejected',
    withdrawn: 'Withdrawn',
  };
  const STATUS_CLASSES: Record<CafeApplicationDetail['status'], string> = {
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-800',
    withdrawn: 'bg-slate-100 text-slate-600',
  };

  const onSubscriptionStatusChange = (value: 'active' | 'trial') => {
    setSubscriptionStatus(value);
    if (value === 'trial') {
      setTermMonths(1);
      setPricePerMonth(0);
    }
  };

  const onTermChange = (value: SubscriptionTermMonths) => {
    setTermMonths(value);
    setPricePerMonth(TERM_OPTIONS.find((option) => option.value === value)?.defaultPrice ?? 0);
  };

  const onApprove = () => {
    approve.mutate(
      {
        id: application.id,
        subscription:
          subscriptionStatus === 'trial'
            ? { status: 'trial', term_months: 1, price_per_month: 0, note: note.trim() || undefined }
            : { status: 'active', term_months: termMonths, price_per_month: Number(pricePerMonth), note: note.trim() || undefined },
      },
      {
        onSuccess: (result) => router.push(`/${result.provisioned.cafe.slug}/dashboard`),
      }
    );
  };

  const onReject = () => {
    if (!rejectNote.trim()) {
      setRejectError('Tell the applicant why so they can fix it.');
      return;
    }
    setRejectError('');
    reject.mutate(
      { id: application.id, note: rejectNote.trim() },
      { onSuccess: () => setRejectNote('') }
    );
  };

  return (
    <section className="max-w-2xl space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-sm text-slate-500">{application.application_ref}</p>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASSES[application.status]}`}
          >
            {STATUS_LABELS[application.status]}
          </span>
        </div>
        <h2 className="mt-1 text-xl font-bold text-slate-900">{application.cafe_name}</h2>
        <p className="text-sm text-slate-600">
          Applied {format(new Date(application.created_at), 'MMM d, yyyy')}
        </p>
      </div>

      <dl className="grid gap-3 border-t border-slate-100 pt-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Applicant</dt>
          <dd className="font-medium">
            {application.applicant ? (
              <>
                {application.applicant.name} · {application.applicant.email} · {application.applicant.phone}
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Organization</dt>
          <dd className="font-medium">{application.organization_name}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Requested slug</dt>
          <dd className="font-medium">/{application.cafe_slug}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Timezone</dt>
          <dd className="font-medium">{application.timezone}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-slate-500">Address</dt>
          <dd className="font-medium">
            {[address.line1, address.line2, address.landmark, address.city, address.state, address.postal_code]
              .filter(Boolean)
              .join(', ')}
          </dd>
          {address.map_url && (
            <a
              href={address.map_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-sm font-semibold text-slate-700 underline"
            >
              Open in maps
            </a>
          )}
        </div>
      </dl>

      {isPending ? (
        <>
          <section className="space-y-3 border-t border-slate-100 pt-5">
            <h3 className="font-semibold">Subscription</h3>
            <div className="flex gap-5 text-sm">
              <label>
                <input
                  type="radio"
                  checked={subscriptionStatus === 'active'}
                  onChange={() => onSubscriptionStatusChange('active')}
                />{' '}
                Active
              </label>
              <label>
                <input
                  type="radio"
                  checked={subscriptionStatus === 'trial'}
                  onChange={() => onSubscriptionStatusChange('trial')}
                />{' '}
                One-month trial at ₹0
              </label>
            </div>
            {subscriptionStatus === 'active' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  aria-label="Term months"
                  value={termMonths}
                  onChange={(event) => onTermChange(Number(event.target.value) as SubscriptionTermMonths)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {TERM_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Price per month"
                  type="number"
                  min={0}
                  value={pricePerMonth}
                  onChange={(event) => setPricePerMonth(Number(event.target.value))}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            )}
            <input
              aria-label="Subscription note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional admin note"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            {approve.isError && <p className="text-sm text-red-700">{apiMessage(approve.error, 'Unable to approve this application.')}</p>}
            <button
              type="button"
              onClick={onApprove}
              disabled={approve.isPending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {approve.isPending ? 'Approving…' : 'Approve & Provision'}
            </button>
          </section>

          <section className="space-y-3 border-t border-slate-100 pt-5">
            <h3 className="font-semibold">Reject</h3>
            <div>
              <label htmlFor="rejection-note" className="mb-1 block text-sm font-medium text-slate-700">
                Rejection note
              </label>
              <textarea
                id="rejection-note"
                value={rejectNote}
                onChange={(event) => setRejectNote(event.target.value)}
                placeholder="Tell the applicant what to fix"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            {rejectError && <p className="text-sm text-red-700">{rejectError}</p>}
            {reject.isError && <p className="text-sm text-red-700">{apiMessage(reject.error, 'Unable to reject this application.')}</p>}
            <button
              type="button"
              onClick={onReject}
              disabled={reject.isPending}
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {reject.isPending ? 'Rejecting…' : 'Reject'}
            </button>
          </section>
        </>
      ) : application.status === 'approved' ? (
        // The review email's link never expires, so a reviewer can land here
        // long after approval — offering Approve/Reject again would be a lie
        // (loadPending already 409s server-side) and is the wrong thing to
        // show a human. Send them to the cafe that already exists instead.
        <section className="space-y-3 border-t border-slate-100 pt-5">
          <p className="text-sm text-slate-600">
            This application was already approved and provisioned.
          </p>
          <a
            href={`/${application.cafe_slug}/dashboard`}
            className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            View the cafe&apos;s dashboard
          </a>
        </section>
      ) : (
        <section className="space-y-3 border-t border-slate-100 pt-5">
          <p className="text-sm text-slate-600">
            This application was {STATUS_LABELS[application.status].toLowerCase()} and can no longer be
            reviewed.
          </p>
          {application.review_note && (
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-700">Note: </span>
              {application.review_note}
            </p>
          )}
        </section>
      )}
    </section>
  );
}
