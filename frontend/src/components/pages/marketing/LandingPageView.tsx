'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Calendar, Users, Zap, ShieldCheck, ArrowRight, Sparkles, LayoutDashboard, Clock } from 'lucide-react';

export function LandingPageView() {
  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col selection:bg-amber-500 selection:text-stone-950">

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative pt-24 pb-20 px-6 max-w-7xl mx-auto text-center overflow-hidden">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-tr from-indigo-600/30 to-amber-500/20 rounded-full blur-3xl pointer-events-none -z-10" />

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-semibold uppercase tracking-wider mb-8">
            <Sparkles className="w-4 h-4 text-amber-400" /> Multi-Tenant SaaS Cafe Reservation Platform
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-balance leading-none max-w-4xl mx-auto">
            Supercharge Your Cafe Operations &{' '}
            <span className="bg-gradient-to-r from-amber-400 via-amber-200 to-indigo-400 bg-clip-text text-transparent">
              Maximize Table Yield
            </span>
          </h1>

          <p className="mt-8 text-lg sm:text-xl text-stone-400 max-w-2xl mx-auto leading-relaxed">
            Real-time floorplan orchestration, optimistic concurrency reservation holds, and zero-friction customer booking flows built for modern cafes.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup">
              <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                Get Started in 2 Minutes <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" size="lg" className="w-full sm:w-auto border-stone-800">
                <LayoutDashboard className="w-5 h-5 text-indigo-400" /> Explore Host Dashboard
              </Button>
            </Link>
          </div>

          {/* Quick Metrics Bar */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6 text-center border border-stone-800/80 rounded-2xl bg-stone-900/40 p-8 backdrop-blur-md">
            <div>
              <div className="text-3xl font-extrabold text-amber-400">99.9%</div>
              <div className="text-xs text-stone-500 mt-1 uppercase tracking-wider font-medium">No Double Booking</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold text-indigo-400">&lt; 50ms</div>
              <div className="text-xs text-stone-500 mt-1 uppercase tracking-wider font-medium">Slot Search Engine</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold text-emerald-400">100%</div>
              <div className="text-xs text-stone-500 mt-1 uppercase tracking-wider font-medium">Subdomain Isolated</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold text-stone-100">Live</div>
              <div className="text-xs text-stone-500 mt-1 uppercase tracking-wider font-medium">WebSocket Floorplan</div>
            </div>
          </div>
        </section>

        {/* Feature Cards Grid */}
        <section className="py-20 px-6 max-w-7xl mx-auto border-t border-stone-900">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Built for Rush Hours & Growth</h2>
            <p className="text-stone-400 mt-3">Engineered from database ACID locks to real-time host UI state.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="bg-stone-900/50 border-stone-800 hover:border-amber-500/50">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-2">
                  <Calendar className="w-6 h-6" />
                </div>
                <CardTitle>Best-Fit Allocation Engine</CardTitle>
                <CardDescription>
                  Automatically computes single or merged table configurations to optimize capacity without empty seats.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-stone-900/50 border-stone-800 hover:border-indigo-500/50">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-2">
                  <Clock className="w-6 h-6" />
                </div>
                <CardTitle>Optimistic Concurrency (OCC)</CardTitle>
                <CardDescription>
                  Host actions respond instantaneously with automatic rollback on network conflicts, keeping floor staff fast.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-stone-900/50 border-stone-800 hover:border-emerald-500/50">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-2">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <CardTitle>Subdomain Multi-Tenancy</CardTitle>
                <CardDescription>
                  Each cafe gets a custom branded domain (`coffeecove.nextbooq.com`) with custom CSS color schemes.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-900 py-12 px-6 text-center text-xs text-stone-600">
        <p>© 2026 nextBooq Platform. All rights reserved.</p>
      </footer>
    </div>
  );
}
