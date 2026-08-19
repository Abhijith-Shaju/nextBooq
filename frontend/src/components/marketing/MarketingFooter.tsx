import React from 'react'
import Link from 'next/link'
import { Coffee } from 'lucide-react'

export default function MarketingFooter() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-brand-brown text-white/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top section */}
        <div className="py-16 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-8">
          {/* Brand column */}
          <div className="space-y-4 max-w-sm">
            <Link href="/" className="flex items-center gap-2 group" aria-label="nextBooq home">
              <div className="w-8 h-8 bg-brand-red rounded-lg flex items-center justify-center">
                <Coffee className="w-4 h-4 text-white" />
              </div>
              <span className="font-display font-bold text-xl text-white tracking-tight">
                next<span className="text-brand-redLight">Booq</span>
              </span>
            </Link>
            <p className="text-sm text-white/60 leading-relaxed">
              The all-in-one reservation platform for modern cafés and restaurants. Simplify bookings, delight guests.
            </p>
          </div>

          <Link
            href="/auth/register"
            className="text-sm font-semibold text-white hover:text-brand-redLight transition-colors"
          >
            Get a demo
          </Link>
        </div>

        {/* Bottom bar */}
        <div className="py-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-white/40">
            © {currentYear} nextBooq. All rights reserved.
          </p>
          <p className="text-sm text-white/40">
            Built with ☕ for café owners everywhere.
          </p>
        </div>
      </div>
    </footer>
  )
}
