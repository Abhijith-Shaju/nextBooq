'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Coffee, ArrowRight, Loader2, Mail } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { useVerifyEmail } from '@/hooks/auth/use-verify-email';
import { useResendVerificationEmail } from '@/hooks/auth/use-resend-verification-email';

function VerifyEmailContent() {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [succeeded, setSucceeded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const verifyEmailMutation = useVerifyEmail();
  const resendMutation = useResendVerificationEmail();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    verifyEmailMutation.mutate(
      { code },
      {
        onSuccess: () => setSucceeded(true),
        onError: () => setErrorMessage('Invalid or expired code.'),
      }
    );
  };

  const handleResend = () => {
    resendMutation.mutate();
  };

  if (user?.is_email_verified || succeeded) {
    return (
      <div className="space-y-4 text-center">
        <p className="font-sans text-brand-brown text-sm bg-brand-tan/40 rounded-xl p-4">
          {succeeded ? 'Email verified.' : 'Your email is already verified.'}
        </p>
        <Link href="/" className="text-brand-red font-semibold hover:underline text-sm">
          Continue to nextBooq
        </Link>
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
            onChange={(e) => setCode(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-brand-brown/20 bg-white/80 focus:bg-white focus:ring-2 focus:ring-brand-red focus:outline-none transition-all text-sm"
          />
        </div>
      </div>

      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

      <button
        type="submit"
        disabled={verifyEmailMutation.isPending}
        className="w-full cta-hero py-3.5 justify-center mt-2 text-base font-semibold shadow-brand-md"
      >
        {verifyEmailMutation.isPending ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Verifying...
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
        {resendMutation.isPending ? 'Sending...' : "Didn't get a code? Resend"}
      </button>
    </form>
  );
}

export default function VerifyEmailPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/auth/login?callbackUrl=%2Fauth%2Fverify-email');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4 py-12">
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
              Enter the 6-digit code we sent to {user?.email}.
            </p>
          </div>

          <VerifyEmailContent />
        </div>

        <div className="text-center">
          <Link href="/" className="inline-block text-brand-mocha hover:text-brand-brown text-sm transition-colors">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
