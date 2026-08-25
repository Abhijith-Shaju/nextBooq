'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { Coffee, ArrowRight, Loader2, Lock, Mail, Eye, EyeOff } from 'lucide-react';
import { useLogin } from '@/hooks/auth/use-login';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { resolvePostAuthDestination } from '@/lib/auth/post-auth-destination';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const loginMutation = useLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }

    loginMutation.mutate(
      { email, password },
      {
        onSuccess: (user) => {
          router.push(resolvePostAuthDestination(user, callbackUrl));
        },
      }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      <div>
        <label className="block text-sm font-semibold text-brand-brown mb-1.5">
          Email Address
        </label>
        <div className="relative" suppressHydrationWarning>
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
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-sm font-semibold text-brand-brown">
            Password
          </label>
          <Link href="/auth/forgot-password" className="text-xs font-medium text-brand-red hover:underline">
            Forgot password?
          </Link>
        </div>
        <div className="relative" suppressHydrationWarning>
          <Lock className="w-5 h-5 text-brand-mocha absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type={showPassword ? 'text' : 'password'}
            required
            placeholder="••••••••"
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

      <button
        type="submit"
        disabled={loginMutation.isPending}
        className="w-full cta-hero py-3.5 justify-center mt-2 text-base font-semibold shadow-brand-md"
      >
        {loginMutation.isPending ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Authenticating...
          </>
        ) : (
          <>
            Sign In <ArrowRight className="w-4 h-4 ml-1" />
          </>
        )}
      </button>
    </form>
  );
}

export default function LoginPage() {
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
            <h1 className="font-display text-3xl font-bold text-brand-brown">Welcome back</h1>
            <p className="font-sans text-brand-mocha text-sm mt-1">
              Log in to your nextBooq account
            </p>
          </div>

          <Suspense fallback={<div className="p-8 text-center text-xs text-brand-mocha animate-pulse">Loading login form...</div>}>
            <LoginForm />
          </Suspense>

          <p className="font-sans text-brand-mocha text-sm text-center">
            New here?{' '}
            <Link href="/auth/register" className="text-brand-red font-semibold hover:underline">
              Create an account
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

