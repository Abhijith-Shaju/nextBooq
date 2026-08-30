'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { Building2 } from 'lucide-react';
import { AuthUser } from '@/lib/types/auth';
import { CafeApplicationSummary } from '@/lib/types/cafe-application';
import { getCafeApplicationCardState } from '@/lib/profile/user-workspace';
import { useWithdrawCafeApplication } from '@/hooks/onboarding/use-withdraw-cafe-application';

function apiMessage(error: unknown): string {
  const candidate = error as { response?: { data?: { error?: { message?: string }; message?: string } }; message?: string };
  return candidate.response?.data?.error?.message || candidate.response?.data?.message || candidate.message || 'Unable to withdraw your application.';
}

interface CafeApplicationCardProps {
  user: AuthUser | null | undefined;
  application: CafeApplicationSummary | null | undefined;
}

export function CafeApplicationCard({ user, application }: CafeApplicationCardProps) {
  const withdraw = useWithdrawCafeApplication();
  const state = getCafeApplicationCardState(user, application);

  if (state === 'hidden') {
    return null;
  }

  if (state === 'apply') {
    return (
      <section className="rounded-3xl bg-white p-8 shadow-card">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tan">
            <Building2 className="h-5 w-5 text-brand-mocha" />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-lg font-bold text-brand-brown">Run a cafe?</h2>
            <p className="mt-1 text-sm text-brand-mocha">
              List your cafe on nextBooq and start taking deposit-secured reservations.
            </p>
            <Link
              href="/onboarding/cafe"
              className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand-red hover:underline"
            >
              Register your cafe
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (state === 'pending' && application) {
    return (
      <section className="rounded-3xl bg-white p-8 shadow-card">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tan">
            <Building2 className="h-5 w-5 text-brand-mocha" />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-lg font-bold text-brand-brown">Cafe application under review</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-block rounded-full bg-brand-tan/60 px-3 py-1 font-mono text-xs text-brand-brown">
                {application.application_ref}
              </span>
              <span className="text-sm font-semibold text-brand-brown">{application.cafe_name}</span>
            </div>
            <p className="mt-2 text-xs text-brand-mocha">
              Submitted {format(new Date(application.created_at), 'MMMM d, yyyy')}
            </p>
            {withdraw.isError && <p className="mt-2 text-sm text-brand-red">{apiMessage(withdraw.error)}</p>}
            <button
              type="button"
              onClick={() => withdraw.mutate()}
              disabled={withdraw.isPending}
              className="mt-4 rounded-xl border border-brand-brown/20 px-4 py-2.5 text-sm font-semibold text-brand-brown transition-colors hover:bg-brand-cream disabled:opacity-50"
            >
              {withdraw.isPending ? 'Withdrawing…' : 'Withdraw application'}
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (state === 'rejected' && application) {
    return (
      <section className="rounded-3xl bg-white p-8 shadow-card">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tan">
            <Building2 className="h-5 w-5 text-brand-mocha" />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-lg font-bold text-brand-brown">Cafe application not approved</h2>
            {application.review_note && (
              <p className="mt-1 text-sm text-brand-mocha">{application.review_note}</p>
            )}
            <Link
              href="/onboarding/cafe"
              className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand-red hover:underline"
            >
              Update and apply again
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return null;
}
