import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Coffee } from 'lucide-react'

/**
 * Register page stub — placeholder for the real auth registration flow.
 * The marketing carousel CTA ("Get Started") routes here.
 * Replace with your actual auth form when building the authentication system.
 */
export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2">
          <div className="w-10 h-10 bg-brand-red rounded-xl flex items-center justify-center shadow-brand-md">
            <Coffee className="w-5 h-5 text-white" />
          </div>
          <span className="font-display font-bold text-2xl text-brand-brown">
            next<span className="text-brand-red">Booq</span>
          </span>
        </div>

        {/* Content */}
        <div className="glass rounded-3xl p-8 space-y-6">
          <h1 className="font-display text-3xl font-bold text-brand-brown">
            Get Started
          </h1>
          <p className="font-sans text-brand-mocha text-base">
            Create your nextBooq account and start accepting reservations in minutes.
          </p>

          {/* TODO: Replace with real registration form */}
          <div className="border-2 border-dashed border-brand-tan rounded-2xl p-6 text-brand-mochaMid text-sm font-sans">
            Registration form coming soon.
          </div>

          <p className="font-sans text-brand-mocha text-sm">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-brand-red font-semibold hover:underline">
              Log in
            </Link>
          </p>
        </div>

        <Link href="/" className="inline-block text-brand-mochaMid hover:text-brand-mocha text-sm transition-colors">
          ← Back to home
        </Link>
      </div>
    </div>
  )
}
