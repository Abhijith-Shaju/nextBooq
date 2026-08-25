'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Coffee, ArrowRight, Loader2, Mail } from 'lucide-react';
import { useForgotPassword } from '@/hooks/auth/use-forgot-password';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const forgotPasswordMutation = useForgotPassword();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    forgotPasswordMutation.mutate(
      { email },
      {
        onSuccess: () => setSubmitted(true),
        onError: () => setSubmitted(true),
      }
    );
  };

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
            <h1 className="font-display text-3xl font-bold text-brand-brown">Reset your password</h1>
            <p className="font-sans text-brand-mocha text-sm mt-1">
              Enter your email and we&apos;ll send you a reset link.
            </p>
          </div>

          {submitted ? (
            <p className="font-sans text-brand-brown text-sm text-center bg-brand-tan/40 rounded-xl p-4">
              If an account exists for that email, we&apos;ve sent a reset link. Check your inbox.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              <div>
                <label className="block text-sm font-semibold text-brand-brown mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-5 h-5 text-brand-mocha absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="name@cafe.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-brand-brown/20 bg-white/80 focus:bg-white focus:ring-2 focus:ring-brand-red focus:outline-none transition-all text-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={forgotPasswordMutation.isPending}
                className="w-full cta-hero py-3.5 justify-center mt-2 text-base font-semibold shadow-brand-md"
              >
                {forgotPasswordMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Sending...
                  </>
                ) : (
                  <>
                    Send Reset Link <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </button>
            </form>
          )}

          <p className="font-sans text-brand-mocha text-sm text-center">
            <Link href="/auth/login" className="text-brand-red font-semibold hover:underline">
              Back to login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
