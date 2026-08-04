'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Sparkles, CheckCircle2, LayoutDashboard, Grid, ArrowRight } from 'lucide-react';

export function SetupWizardView() {
  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" /> Provisioning Complete
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Welcome to Your New Cafe Dashboard</h1>
        <p className="text-stone-400 text-sm">
          Your organization, cafe profile, and subscription have been successfully initialized.
        </p>
      </div>

      <Card className="bg-stone-900/90 border-stone-800">
        <CardHeader>
          <CardTitle className="text-xl">Quick Setup Checklist</CardTitle>
          <CardDescription>Complete these 2 steps to start accepting real guest bookings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-xl bg-stone-800/60 border border-stone-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <div className="font-bold text-stone-100">Step 1: Subdomain Provisioned</div>
                <div className="text-xs text-stone-400">Authenticated via shared `.nextbooq.com` session.</div>
              </div>
            </div>
            <span className="text-xs text-emerald-400 font-bold">READY</span>
          </div>

          <div className="p-4 rounded-xl bg-stone-800/60 border border-stone-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Grid className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <div className="font-bold text-stone-100">Step 2: Add Tables & Merging Rules</div>
                <div className="text-xs text-stone-400">Define table capacities so the allocation engine can fit parties.</div>
              </div>
            </div>
            <Link href="/dashboard/tables">
              <Button variant="secondary" size="sm">
                Configure Tables
              </Button>
            </Link>
          </div>

          <div className="pt-4">
            <Link href="/dashboard">
              <Button variant="primary" className="w-full font-extrabold py-3 text-base">
                Launch Host Stand Floorplan <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
