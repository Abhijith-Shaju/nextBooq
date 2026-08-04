'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { useSlugCheck } from '@/hooks/useSlugCheck';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Store, Globe, ArrowRight, Loader2, CheckCircle2, XCircle } from 'lucide-react';

export function CafeDetailsView() {
  const router = useRouter();
  const { cafeName: initialCafeName, slug: initialSlug, timezone: initialTz, setCafeDetails, setStep } = useOnboardingStore();

  const [cafeName, setCafeName] = useState(initialCafeName || '');
  const [slug, setSlug] = useState(initialSlug || '');
  const [timezone, setTimezone] = useState(initialTz || 'Asia/Kolkata');

  const { isChecking, isAvailable, reason, debouncedSlug } = useSlugCheck(slug);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCafeName(val);
    if (!slug || slug === initialSlug) {
      setSlug(val.toLowerCase().replace(/[^a-z0-9]/g, ''));
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAvailable) return;

    setCafeDetails({ cafeName, slug: debouncedSlug, timezone });
    setStep(3);
    router.push('/onboarding/billing');
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-md bg-stone-900/90 border-stone-800">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-2">
            <Store className="w-6 h-6" />
          </div>
          <CardTitle>Cafe Setup & Subdomain</CardTitle>
          <CardDescription>Step 2 of 3: Reserve your cafe's booking link</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Cafe Name"
              placeholder="e.g. Central Perk Cafe"
              value={cafeName}
              onChange={handleNameChange}
              required
            />

            <div>
              <Input
                label="Custom URL Slug"
                placeholder="centralperk"
                value={slug}
                onChange={handleSlugChange}
                required
              />
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-stone-400 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-stone-500" />
                  {debouncedSlug ? `${debouncedSlug}.nextbooq.com` : 'yourcafe.nextbooq.com'}
                </span>
                {isChecking && (
                  <span className="text-amber-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Checking...
                  </span>
                )}
                {!isChecking && debouncedSlug.length >= 3 && isAvailable && (
                  <span className="text-emerald-400 flex items-center gap-1 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Available!
                  </span>
                )}
                {!isChecking && debouncedSlug.length >= 3 && !isAvailable && (
                  <span className="text-rose-400 flex items-center gap-1 font-medium">
                    <XCircle className="w-3.5 h-3.5" /> {reason || 'Unavailable'}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                Operating Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl text-sm bg-stone-800 border border-stone-700 text-stone-100 focus:outline-none focus:border-indigo-400"
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST)</option>
              </select>
            </div>

            <Button
              type="submit"
              variant="secondary"
              className="w-full font-semibold mt-2"
              disabled={!isAvailable || isChecking}
            >
              Continue to Billing <ArrowRight className="w-4 h-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
