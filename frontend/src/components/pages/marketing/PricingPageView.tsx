'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Check, Sparkles } from 'lucide-react';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { useRouter } from 'next/navigation';

export function PricingPageView() {
  const router = useRouter();
  const setSelectedPlan = useOnboardingStore((s) => s.setSelectedPlan);

  const handleSelectPlan = (plan: 'pro' | 'enterprise') => {
    setSelectedPlan(plan);
    router.push('/signup');
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 py-20 px-6 max-w-7xl mx-auto flex flex-col items-center">
      <div className="text-center max-w-3xl mb-16">
        <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
          Transparent Pricing
        </span>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mt-4">
          Choose the Perfect Plan for Your Cafe
        </h1>
        <p className="text-stone-400 mt-4 text-lg">
          Start with a 14-day free trial. Upgrade or cancel anytime.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 w-full max-w-4xl">
        {/* Pro Tier */}
        <Card className="bg-stone-900/60 border-stone-800 flex flex-col justify-between hover:border-stone-700 transition-all">
          <CardHeader>
            <div className="text-stone-400 font-semibold text-sm">PRO TIER</div>
            <CardTitle className="text-3xl font-extrabold mt-1">₹2,999 <span className="text-sm font-normal text-stone-400">/ month</span></CardTitle>
            <CardDescription className="mt-2">
              For single location cafes ready to automate reservations and floorplan management.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-sm text-stone-300">
              <Check className="w-5 h-5 text-emerald-400 shrink-0" /> Up to 50 Tables & Canvas Visualizer
            </div>
            <div className="flex items-center gap-3 text-sm text-stone-300">
              <Check className="w-5 h-5 text-emerald-400 shrink-0" /> Best-Fit Allocation Engine
            </div>
            <div className="flex items-center gap-3 text-sm text-stone-300">
              <Check className="w-5 h-5 text-emerald-400 shrink-0" /> Custom Subdomain & Branding
            </div>
            <div className="flex items-center gap-3 text-sm text-stone-300">
              <Check className="w-5 h-5 text-emerald-400 shrink-0" /> Razorpay Route Split Payments
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full" onClick={() => handleSelectPlan('pro')}>
              Start Pro 14-Day Trial
            </Button>
          </CardFooter>
        </Card>

        {/* Enterprise Tier */}
        <Card className="bg-gradient-to-b from-stone-900 to-indigo-950/40 border-amber-500/40 relative flex flex-col justify-between shadow-2xl shadow-amber-500/5">
          <div className="absolute -top-3 right-6 bg-gradient-to-r from-amber-400 to-amber-500 text-stone-950 font-black text-[10px] uppercase tracking-wider px-3 py-1 rounded-full shadow-md">
            POPULAR
          </div>
          <CardHeader>
            <div className="text-amber-400 font-semibold text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> ENTERPRISE TIER
            </div>
            <CardTitle className="text-3xl font-extrabold mt-1">₹5,999 <span className="text-sm font-normal text-stone-400">/ month</span></CardTitle>
            <CardDescription className="mt-2">
              For high-volume multi-zone cafes with VIP tables and dedicated support requirements.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-sm text-stone-200">
              <Check className="w-5 h-5 text-amber-400 shrink-0" /> Unlimited Tables & Multi-Zone Merge Rules
            </div>
            <div className="flex items-center gap-3 text-sm text-stone-200">
              <Check className="w-5 h-5 text-amber-400 shrink-0" /> Real-time WebSocket Host Stand Manifest
            </div>
            <div className="flex items-center gap-3 text-sm text-stone-200">
              <Check className="w-5 h-5 text-amber-400 shrink-0" /> High-Priority Concurrency Lock Engine
            </div>
            <div className="flex items-center gap-3 text-sm text-stone-200">
              <Check className="w-5 h-5 text-amber-400 shrink-0" /> 24/7 Priority Manager Support
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="secondary" className="w-full font-bold" onClick={() => handleSelectPlan('enterprise')}>
              Start Enterprise Trial
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
