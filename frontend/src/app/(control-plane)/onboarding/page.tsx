'use client';

import React, { Suspense } from 'react';
import { Coffee, Loader2, User as UserIcon, Store } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { useUpdateAccountType } from '@/hooks/auth/use-update-account-type';
import { normalizeSafePath } from '@/lib/auth/post-auth-destination';

function OnboardingChoice() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const updateAccountType = useUpdateAccountType();

  // Reuse the same same-origin/no-backslash/no-control-character validation
  // post-auth-destination.ts already enforces elsewhere, rather than a
  // second, weaker variant — an open redirect here would let an attacker
  // bounce a fresh signup off to an arbitrary external site right after they
  // choose their role.
  const rawCallbackUrl = searchParams.get('callbackUrl');
  const callbackUrl = normalizeSafePath(rawCallbackUrl) ?? '/';

  const chooseCustomer = () => {
    updateAccountType.mutate(
      { account_type: 'customer' },
      { onSuccess: () => router.push(callbackUrl) }
    );
  };

  const chooseCafeOwner = () => {
    updateAccountType.mutate(
      { account_type: 'cafe_owner' },
      { onSuccess: () => router.push('/onboarding/cafe') }
    );
  };

  return (
    <div className="space-y-4 text-left">
      <button
        type="button"
        onClick={chooseCustomer}
        disabled={updateAccountType.isPending}
        className="w-full flex items-center gap-4 rounded-2xl border border-brand-brown/15 bg-white/80 hover:bg-white hover:border-brand-red/40 transition-all p-5 text-left disabled:opacity-50"
      >
        <div className="w-11 h-11 rounded-xl bg-brand-tan/60 flex items-center justify-center shrink-0">
          <UserIcon className="w-5 h-5 text-brand-brown" />
        </div>
        <div>
          <p className="font-display font-semibold text-brand-brown">I'm booking a table</p>
          <p className="font-sans text-sm text-brand-mocha">Find a cafe and reserve a seat.</p>
        </div>
      </button>

      <button
        type="button"
        onClick={chooseCafeOwner}
        disabled={updateAccountType.isPending}
        className="w-full flex items-center gap-4 rounded-2xl border border-brand-brown/15 bg-white/80 hover:bg-white hover:border-brand-red/40 transition-all p-5 text-left disabled:opacity-50"
      >
        <div className="w-11 h-11 rounded-xl bg-brand-tan/60 flex items-center justify-center shrink-0">
          <Store className="w-5 h-5 text-brand-brown" />
        </div>
        <div>
          <p className="font-display font-semibold text-brand-brown">I run a cafe</p>
          <p className="font-sans text-sm text-brand-mocha">Set up your cafe on nextBooq.</p>
        </div>
      </button>

      {updateAccountType.isPending && (
        <div className="flex items-center justify-center gap-2 text-sm text-brand-mocha">
          <Loader2 className="w-4 h-4 animate-spin" /> Saving…
        </div>
      )}

      <p className="text-center text-xs text-brand-mocha/80">
        You can change this later from your profile.
      </p>
    </div>
  );
}

function OnboardingGuard() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4 pb-12 pt-24 md:pt-28">
      <div className="max-w-md w-full space-y-8">
        <div className="flex items-center justify-center gap-2">
          <div className="w-10 h-10 bg-brand-red rounded-xl flex items-center justify-center shadow-brand-md">
            <Coffee className="w-5 h-5 text-white" />
          </div>
          <span className="font-display font-bold text-2xl text-brand-brown">
            next<span className="text-brand-red">Booq</span>
          </span>
        </div>

        <div className="glass rounded-3xl p-8 space-y-6 shadow-brand-md border border-brand-brown/10">
          <div className="text-center">
            <h1 className="font-display text-3xl font-bold text-brand-brown">How will you use nextBooq?</h1>
            {user?.email && (
              <p className="font-sans text-brand-mocha text-sm mt-1">Signed in as {user.email}</p>
            )}
          </div>

          <OnboardingChoice />
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingGuard />
    </Suspense>
  );
}
