'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Coffee, ArrowRight, Loader2, Lock, Eye, EyeOff } from 'lucide-react';
import { useResetPassword } from '@/hooks/auth/use-reset-password';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const resetPasswordMutation = useResetPassword();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setErrorMessage(null);
    resetPasswordMutation.mutate(
      { token, password },
      {
        onSuccess: () => setSucceeded(true),
        onError: () => setErrorMessage('This reset link is invalid or has expired.'),
      }
    );
  };

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <p className="font-sans text-brand-brown text-sm bg-brand-tan/40 rounded-xl p-4">
          This reset link is invalid or has expired.
        </p>
        <Link href="/auth/forgot-password" className="text-brand-red font-semibold hover:underline text-sm">
          Request a new link
        </Link>
      </div>
    );
  }

  if (succeeded) {
    return (
      <div className="space-y-4 text-center">
        <p className="font-sans text-brand-brown text-sm bg-brand-tan/40 rounded-xl p-4">
          Password updated. You can now log in.
        </p>
        <Link href="/auth/login" className="text-brand-red font-semibold hover:underline text-sm">
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      <div>
        <label className="block text-sm font-semibold text-brand-brown mb-1.5">
          New Password
        </label>
        <div className="relative">
          <Lock className="w-5 h-5 text-brand-mocha absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type={showPassword ? 'text' : 'password'}
            required
            minLength={8}
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full pl-10 pr-10 py-3 rounded-xl border border-brand-brown/20 bg-white/80 focus:bg-white focus:ring-2 focus:ring-brand-red focus:outline-none transition-all text-sm"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-mocha hover:text-brand-brown"
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

      <button
        type="submit"
        disabled={resetPasswordMutation.isPending}
        className="w-full cta-hero py-3.5 justify-center mt-2 text-base font-semibold shadow-brand-md"
      >
        {resetPasswordMutation.isPending ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Updating...
          </>
        ) : (
          <>
            Update Password <ArrowRight className="w-4 h-4 ml-1" />
          </>
        )}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
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
            <h1 className="font-display text-3xl font-bold text-brand-brown">Set a new password</h1>
          </div>

          <Suspense fallback={<div className="p-8 text-center text-xs text-brand-mocha animate-pulse">Loading...</div>}>
            <ResetPasswordForm />
          </Suspense>
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
