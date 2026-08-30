'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Coffee, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { useMyCafeApplication } from '@/hooks/onboarding/use-my-cafe-application';
import { useWithdrawCafeApplication } from '@/hooks/onboarding/use-withdraw-cafe-application';
import { apiMessage } from '@/lib/api-message';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4 pb-12 pt-24 md:pt-28">
      <div className="max-w-xl w-full space-y-8">
        <div className="flex items-center justify-center gap-2">
          <div className="w-10 h-10 bg-brand-red rounded-xl flex items-center justify-center shadow-brand-md">
            <Coffee className="w-5 h-5 text-white" />
          </div>
          <span className="font-display font-bold text-2xl text-brand-brown">
            next<span className="text-brand-red">Booq</span>
          </span>
        </div>

        <div className="glass rounded-3xl p-8 space-y-6 shadow-brand-md border border-brand-brown/10 text-center">
          {children}
        </div>
      </div>
    </div>
  );
}

function OnboardingStatusGuard() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: application, isLoading } = useMyCafeApplication();
  const withdraw = useWithdrawCafeApplication();

  // Only redirect once the query has actually settled — bouncing a
  // legitimate applicant to /onboarding/cafe while the request is still in
  // flight would flash them out of their own status page. A withdrawn
  // application is terminal (the backend keeps the record with
  // status: 'withdrawn' rather than deleting it — withdrawApplication only
  // matches status: 'pending', so a second Withdraw click here would 404),
  // so it gets the same "start a fresh application" treatment as no
  // application at all.
  const hasActiveApplication = !!application && application.status !== 'withdrawn';

  useEffect(() => {
    if (isLoading) return;
    if (!hasActiveApplication) {
      router.replace('/onboarding/cafe');
    }
  }, [isLoading, hasActiveApplication, router]);

  if (isLoading || !hasActiveApplication) {
    return (
      <Shell>
        <Loader2 className="w-6 h-6 animate-spin text-brand-mocha mx-auto" />
      </Shell>
    );
  }

  if (application.status === 'approved') {
    return (
      <Shell>
        <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
        <h1 className="font-display text-3xl font-bold text-brand-brown">You're approved!</h1>
        <p className="font-sans text-brand-mocha text-sm">
          {application.cafe_name} is ready to go on nextBooq.
        </p>
        <Link
          href={`/${application.cafe_slug}/dashboard`}
          className="cta-hero inline-flex px-5 py-2.5 text-sm font-semibold"
        >
          Go to your dashboard
        </Link>
      </Shell>
    );
  }

  if (application.status === 'rejected') {
    return (
      <Shell>
        <XCircle className="w-10 h-10 text-brand-red mx-auto" />
        <h1 className="font-display text-3xl font-bold text-brand-brown">Application not approved</h1>
        {application.review_note && (
          <p className="font-sans text-sm text-brand-mocha">{application.review_note}</p>
        )}
        <Link
          href="/onboarding/cafe"
          className="cta-hero inline-flex px-5 py-2.5 text-sm font-semibold"
        >
          Submit a new application
        </Link>
      </Shell>
    );
  }

  // pending (or any other in-progress status)
  return (
    <Shell>
      <Clock className="w-10 h-10 text-brand-mocha mx-auto" />
      <h1 className="font-display text-3xl font-bold text-brand-brown">Application received</h1>
      <p className="inline-block rounded-full bg-brand-tan/60 px-4 py-1.5 font-mono text-sm text-brand-brown">
        {application.application_ref}
      </p>
      <div className="text-sm text-brand-mocha space-y-1">
        <p className="font-semibold text-brand-brown">{application.cafe_name}</p>
        <p className="font-mono">nextbooq.in/{application.cafe_slug}</p>
      </div>
      <p className="font-sans text-brand-mocha text-sm">
        We&apos;re reviewing your application. We&apos;ll email you at {user?.email} once it&apos;s
        approved — usually within a couple of working days.
      </p>
      {withdraw.isError && <p className="text-sm text-brand-red">{apiMessage(withdraw.error, 'Unable to withdraw your application.')}</p>}
      <button
        type="button"
        onClick={() => withdraw.mutate()}
        disabled={withdraw.isPending}
        className="rounded-xl border border-brand-brown/20 px-4 py-2.5 text-sm font-semibold text-brand-brown hover:bg-white transition-colors disabled:opacity-50"
      >
        {withdraw.isPending ? 'Withdrawing…' : 'Withdraw application'}
      </button>
    </Shell>
  );
}

export default function OnboardingStatusPage() {
  return <OnboardingStatusGuard />;
}
