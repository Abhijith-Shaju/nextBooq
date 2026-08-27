'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Coffee, ArrowRight, Loader2, Mail } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { useVerifyEmail } from '@/hooks/auth/use-verify-email';
import { useResendVerificationEmail } from '@/hooks/auth/use-resend-verification-email';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

function VerifyEmailContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const rawCallbackUrl = searchParams.get('callbackUrl');
  const source = searchParams.get('source'); // 'register' | null
  // Sanitise: only allow same-origin relative paths.
  const callbackUrl =
    rawCallbackUrl && rawCallbackUrl.startsWith('/') ? rawCallbackUrl : '/';

  const [code, setCode] = useState('');
  const [succeeded, setSucceeded] = useState(false);
  const verifyEmailMutation = useVerifyEmail();
  const resendMutation = useResendVerificationEmail();

  // After success, invalidate /me so the banner knows verification is done,
  // then show a contextual toast and redirect.
  const handleSuccess = async () => {
    setSucceeded(true);
    await queryClient.invalidateQueries({ queryKey: ['me'] });

    if (source === 'register') {
      toast.success('Registration complete! Your email has been verified.', { duration: 4000 });
    } else if (source === 'email-change') {
      toast.success('Your email address has been updated and verified.', { duration: 3000 });
    } else {
      toast.success('Email verified successfully!', { duration: 3000 });
    }

    // Short delay so the user sees the success state before navigating.
    setTimeout(() => {
      router.push(callbackUrl);
    }, 1500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    verifyEmailMutation.mutate(
      { code },
      {
        onSuccess: handleSuccess,
        onError: () => toast.error('Invalid or expired code. Please try again.'),
      }
    );
  };

  const handleResend = () => {
    resendMutation.mutate(undefined, {
      onSuccess: () => toast.success('A new code has been sent to your inbox.'),
      onError: () => toast.error('Could not resend code. Please try again.'),
    });
  };

  // Already verified — redirect immediately. A pending email change keeps
  // is_email_verified true for the still-live old address, so don't bounce
  // away while a change confirmation is actually what brought us here.
  useEffect(() => {
    if (user?.is_email_verified && !user?.pending_email && !succeeded) {
      router.replace(callbackUrl);
    }
  }, [user?.is_email_verified, user?.pending_email, succeeded, callbackUrl, router]);

  if (succeeded) {
    return (
      <div className="space-y-4 text-center">
        <div className="w-16 h-16 mx-auto bg-emerald-100 rounded-full flex items-center justify-center">
          <Mail className="w-8 h-8 text-emerald-600" />
        </div>
        <p className="font-sans text-brand-brown text-sm bg-brand-tan/40 rounded-xl p-4">
          {source === 'register'
            ? 'Registration complete! Taking you to the app…'
            : 'Email verified! Taking you back…'}
        </p>
        <Loader2 className="w-5 h-5 mx-auto animate-spin text-brand-mocha" />
      </div>
    );
  }

  // Already verified on arrival (e.g. a stale link revisited) — the effect
  // above redirects away, but show this instead of flashing the code form
  // while that redirect is in flight.
  if (user?.is_email_verified && !user?.pending_email) {
    return (
      <div className="space-y-4 text-center">
        <div className="w-16 h-16 mx-auto bg-emerald-100 rounded-full flex items-center justify-center">
          <Mail className="w-8 h-8 text-emerald-600" />
        </div>
        <p className="font-sans text-brand-brown text-sm bg-brand-tan/40 rounded-xl p-4">
          Your email is already verified. Redirecting…
        </p>
        <Loader2 className="w-5 h-5 mx-auto animate-spin text-brand-mocha" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      <div>
        <label className="block text-sm font-semibold text-brand-brown mb-1.5">
          Verification Code
        </label>
        <div className="relative">
          <Mail className="w-5 h-5 text-brand-mocha absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            inputMode="numeric"
            required
            maxLength={6}
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-brand-brown/20 bg-white/80 focus:bg-white focus:ring-2 focus:ring-brand-red focus:outline-none transition-all text-sm tracking-widest font-mono"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={verifyEmailMutation.isPending || code.length < 6}
        className="w-full cta-hero py-3.5 justify-center mt-2 text-base font-semibold shadow-brand-md"
      >
        {verifyEmailMutation.isPending ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Verifying…
          </>
        ) : (
          <>
            Verify Email <ArrowRight className="w-4 h-4 ml-1" />
          </>
        )}
      </button>

      <button
        type="button"
        onClick={handleResend}
        disabled={resendMutation.isPending}
        className="w-full text-center text-sm text-brand-mocha hover:text-brand-brown underline disabled:opacity-50"
      >
        {resendMutation.isPending ? 'Sending…' : "Didn't get a code? Resend"}
      </button>
    </form>
  );
}

function VerifyEmailGuard() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const searchParams = useSearchParams();

  const rawCallbackUrl = searchParams.get('callbackUrl');
  const callbackUrl =
    rawCallbackUrl && rawCallbackUrl.startsWith('/') ? rawCallbackUrl : '/';
  const verificationQuery = searchParams.toString();
  const verificationPath = `/auth/verify-email${verificationQuery ? `?${verificationQuery}` : ''}`;

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace(`/auth/login?callbackUrl=${encodeURIComponent(verificationPath)}`);
    }
  }, [isLoading, isAuthenticated, router, verificationPath]);

  if (isLoading || !isAuthenticated) {
    return null;
  }

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
            <h1 className="font-display text-3xl font-bold text-brand-brown">Verify your email</h1>
            <p className="font-sans text-brand-mocha text-sm mt-1">
              Enter the 6-digit code we sent to{' '}
              <span className="font-semibold text-brand-brown">{user?.pending_email || user?.email}</span>.
            </p>
          </div>

          <VerifyEmailContent />
        </div>

        <div className="text-center">
          <Link
            href={callbackUrl}
            className="inline-block text-brand-mocha hover:text-brand-brown text-sm transition-colors"
          >
            ← Back
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailGuard />
    </Suspense>
  );
}
