import React from 'react'
import Link from 'next/link'
import { Coffee } from 'lucide-react'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="flex items-center justify-center gap-2">
          <div className="w-10 h-10 bg-brand-red rounded-xl flex items-center justify-center shadow-brand-md">
            <Coffee className="w-5 h-5 text-white" />
          </div>
          <span className="font-display font-bold text-2xl text-brand-brown">
            next<span className="text-brand-red">Booq</span>
          </span>
        </div>
        <div className="glass rounded-3xl p-8 space-y-6">
          <h1 className="font-display text-3xl font-bold text-brand-brown">Welcome back</h1>
          <p className="font-sans text-brand-mocha text-base">
            Log in to your nextBooq dashboard.
          </p>
          <div className="border-2 border-dashed border-brand-tan rounded-2xl p-6 text-brand-mochaMid text-sm font-sans">
            Login form coming soon.
          </div>
          <p className="font-sans text-brand-mocha text-sm">
            New here?{' '}
            <Link href="/auth/register" className="text-brand-red font-semibold hover:underline">
              Create an account
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
