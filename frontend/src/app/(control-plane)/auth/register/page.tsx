'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { Coffee, ArrowRight, Loader2, Lock, Mail, User as UserIcon, Phone, Eye, EyeOff } from 'lucide-react';
import { useRegister } from '@/hooks/auth/use-register';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { resolvePostAuthDestination } from '@/lib/auth/post-auth-destination';
import { isValidPhoneNumber } from '@/lib/auth/phone-number';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  const registerMutation = useRegister();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !phone || !password) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (!isValidPhoneNumber(phone)) {
      toast.error('Please enter a valid phone number');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }
    if (!acceptTerms) {
      toast.error('Please accept the Terms and Conditions to continue');
      return;
    }

    registerMutation.mutate(
      { name, email, phone, password, accept_terms: true },
      {
        onSuccess: (user) => {
          const destination = resolvePostAuthDestination(user, callbackUrl);
          // Always gate new registrations through email verification before
          // they reach the app. source=register lets verify-email show the
          // "Registration complete!" toast after the code is accepted.
          router.push(
            `/auth/verify-email?callbackUrl=${encodeURIComponent(destination)}&source=register`
          );
        },
      }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div>
              <label className="block text-sm font-semibold text-brand-brown mb-1.5">
                Full Name <span className="text-brand-red">*</span>
              </label>
              <div className="relative">
                <UserIcon className="w-5 h-5 text-brand-mocha absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-brand-brown/20 bg-white/80 focus:bg-white focus:ring-2 focus:ring-brand-red focus:outline-none transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-brand-brown mb-1.5">
                Email Address <span className="text-brand-red">*</span>
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

            <div>
              <label className="block text-sm font-semibold text-brand-brown mb-1.5">
                Phone Number <span className="text-brand-red">*</span>
              </label>
              <div className="relative">
                <Phone className="w-5 h-5 text-brand-mocha absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  required
                  inputMode="tel"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-brand-brown/20 bg-white/80 focus:bg-white focus:ring-2 focus:ring-brand-red focus:outline-none transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-brand-brown mb-1.5">
                Password <span className="text-brand-red">*</span>
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

            {/* Clickwrap, not browsewrap. The Terms claim acceptance happens by
                clicking "I Agree", and Indian courts treat an explicit
                affirmative act as materially stronger evidence than a notice
                that using the site implies agreement. The API refuses the
                registration without it, so this cannot be bypassed by a
                client that skips the box. */}
            <label className="flex items-start gap-2.5 text-xs text-brand-mocha cursor-pointer">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-brand-red shrink-0"
                aria-describedby="terms-consent-text"
              />
              <span id="terms-consent-text">
                I agree to the{' '}
                <Link href="/legal/terms" target="_blank" className="text-brand-red font-semibold hover:underline">
                  Terms and Conditions
                </Link>{' '}
                and the{' '}
                <Link href="/legal/privacy" target="_blank" className="text-brand-red font-semibold hover:underline">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>

            <button
              type="submit"
              disabled={registerMutation.isPending || !acceptTerms}
              className="w-full cta-hero py-3.5 justify-center mt-2 text-base font-semibold shadow-brand-md"
            >
              {registerMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Creating Account...
                </>
              ) : (
                <>
                  Create Account <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </button>
          </form>
  );
}

export default function RegisterPage() {
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
            <h1 className="font-display text-3xl font-bold text-brand-brown">Create Account</h1>
            <p className="font-sans text-brand-mocha text-sm mt-1">
              Create your nextBooq account to book and manage reservations.
            </p>
          </div>

          <Suspense fallback={<div className="p-8 text-center text-xs text-brand-mocha animate-pulse">Loading form...</div>}>
            <RegisterForm />
          </Suspense>

          <p className="font-sans text-brand-mocha text-sm text-center">
            Already registered?{' '}
            <Link href="/auth/login" className="text-brand-red font-semibold hover:underline">
              Log in
            </Link>
          </p>
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
