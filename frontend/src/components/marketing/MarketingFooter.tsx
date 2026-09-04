'use client'

import React from 'react'
import Link from 'next/link'
import { Coffee } from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'

export default function MarketingFooter() {
  const currentYear = new Date().getFullYear()
  const { isAuthenticated, isLoading } = useAuth()

  return (
    <footer className="relative bg-brand-brown text-white/80 overflow-hidden">
      {/* Faint watermark motif, echoing the homepage hero's decorative devices */}
      <Coffee
        aria-hidden="true"
        className="absolute -bottom-10 -right-10 w-56 h-56 text-white/[0.04] pointer-events-none select-none rotate-12"
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top section */}
        <div className="py-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Brand column */}
          <div className="space-y-4 lg:col-span-2 max-w-sm">
            <Link href="/" className="flex items-center gap-2 group" aria-label="nextBooq home">
              <div className="w-8 h-8 bg-brand-red rounded-lg flex items-center justify-center">
                <Coffee className="w-4 h-4 text-white" />
              </div>
              <span className="font-display font-bold text-xl text-white tracking-tight">
                next<span className="text-brand-redLight">Booq</span>
              </span>
            </Link>
            <p className="text-sm text-white/60 leading-relaxed">
              The all-in-one reservation platform for modern cafés and restaurants. Real-time table holds, a
              time-boxed deposit to lock in every booking, and a live floor manifest so no table gets double-booked.
            </p>
          </div>

          {/* Company column */}
          <div className="space-y-3">
            <h3 className="font-display text-sm font-semibold text-white tracking-wide uppercase">Company</h3>
            <nav className="flex flex-col gap-2.5" aria-label="Company">
              <Link href="/#about" className="text-sm text-white/60 hover:text-white transition-colors">
                About
              </Link>
              {/* Standalone route, not the /#contact anchor: this one has to
                  survive being linked from an email, a search result, or a
                  payment aggregator's onboarding form. */}
              <Link href="/contact" className="text-sm text-white/60 hover:text-white transition-colors">
                Contact
              </Link>
            </nav>
          </div>

          {/* Legal column — published as separate URLs because the E-Commerce
              Rules 2020 and payment aggregators both expect them reachable. */}
          <div className="space-y-3">
            <h3 className="font-display text-sm font-semibold text-white tracking-wide uppercase">Legal</h3>
            <nav className="flex flex-col gap-2.5" aria-label="Legal">
              <Link href="/legal/terms" className="text-sm text-white/60 hover:text-white transition-colors">
                Terms &amp; Conditions
              </Link>
              <Link href="/legal/privacy" className="text-sm text-white/60 hover:text-white transition-colors">
                Privacy Policy
              </Link>
              <Link href="/legal/refunds" className="text-sm text-white/60 hover:text-white transition-colors">
                Cancellation &amp; Refunds
              </Link>
            </nav>
          </div>

          {/* For café owners column */}
          <div className="space-y-3">
            <h3 className="font-display text-sm font-semibold text-white tracking-wide uppercase">For café owners</h3>
            <nav className="flex flex-col gap-2.5" aria-label="For café owners">
              {!isLoading && isAuthenticated ? (
                <Link href="/profile" className="text-sm text-white/60 hover:text-white transition-colors">
                  View Account
                </Link>
              ) : (
                <>
                  <Link href="/auth/login" className="text-sm text-white/60 hover:text-white transition-colors">
                    Log in
                  </Link>
                  {!isLoading && (
                    <Link
                      href="/auth/register"
                      className="text-sm font-semibold text-white hover:text-brand-redLight transition-colors"
                    >
                      Get a demo
                    </Link>
                  )}
                </>
              )}
            </nav>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="py-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-white/40">
            © {currentYear} nextBooq. All rights reserved.
          </p>
          <p className="text-sm text-white/40">
            Made in India 🇮🇳 — built with ☕ for café owners everywhere.
          </p>
        </div>
      </div>
    </footer>
  )
}
