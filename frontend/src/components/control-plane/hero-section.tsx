'use client';

import Link from 'next/link';
import { ArrowRight, Sparkles, ShieldCheck, Zap, Calendar } from 'lucide-react';

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-20 pb-16 md:pt-28 md:pb-24">
      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-red/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-[300px] h-[300px] bg-brand-mocha/10 rounded-full blur-2xl pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-brand-tan/50 mb-8 shadow-brand-sm animate-fade-in">
          <Sparkles className="w-4 h-4 text-brand-red" />
          <span className="text-sm font-semibold text-brand-brown">
            The Multi-Tenant Operating System for Fine Cafes
          </span>
        </div>

        {/* Heading */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-display font-bold text-brand-brown tracking-tight leading-[1.1] mb-6">
          Streamline Reservations.{' '}
          <span className="bg-gradient-to-r from-brand-red via-red-600 to-brand-mocha bg-clip-text text-transparent">
            Maximize Cover Density.
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-lg sm:text-xl text-brand-mocha max-w-3xl mx-auto mb-10 leading-relaxed">
          nextBooq provides real-time table availability, automated deposit collection via Razorpay,
          and a high-speed iPad host stand layout with optimistic concurrency control.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Link
            href="/auth/register"
            className="w-full sm:w-auto cta-hero text-base"
          >
            Start 14-Day Free Trial
            <ArrowRight className="w-5 h-5 ml-1" />
          </Link>
          <Link
            href="/pricing"
            className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 rounded-full font-semibold border border-brand-mocha/20 text-brand-brown hover:bg-brand-tan/50 transition-all duration-200"
          >
            View Pricing Plans
          </Link>
        </div>

        {/* Trust Indicators */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-10 border-t border-brand-brown/10 max-w-4xl mx-auto text-left">
          <div className="flex items-start gap-3 p-4 rounded-xl glass">
            <div className="p-2 rounded-lg bg-brand-red/10 text-brand-red">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-brand-brown text-sm">Real-Time Inventory</h3>
              <p className="text-xs text-brand-mocha mt-0.5">
                Instant slot reservation with automated hold expiration timers.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 rounded-xl glass">
            <div className="p-2 rounded-lg bg-brand-red/10 text-brand-red">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-brand-brown text-sm">Zero No-Shows</h3>
              <p className="text-xs text-brand-mocha mt-0.5">
                Upfront deposit authorization powered by Razorpay checkout SDK.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 rounded-xl glass">
            <div className="p-2 rounded-lg bg-brand-red/10 text-brand-red">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-brand-brown text-sm">Interactive Host Stand</h3>
              <p className="text-xs text-brand-mocha mt-0.5">
                Visual floorplan canvas with 1-click status transitions and OCC safety.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
