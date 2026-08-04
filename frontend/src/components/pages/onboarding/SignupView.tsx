'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api-client';
import { ShieldCheck, ArrowRight } from 'lucide-react';

export function SignupView() {
  const router = useRouter();
  const { setIdentity, setStep } = useOnboardingStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // Register or resume identity check
      await apiClient('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, phone, password }),
      });

      setIdentity({ name, email, phone });
      setStep(2);
      router.push('/onboarding/cafe');
    } catch (err: any) {
      // Resumable check: if user exists with no memberships, proceed
      if (err?.status === 409) {
        setIdentity({ name, email, phone });
        setStep(2);
        router.push('/onboarding/cafe');
        return;
      }
      setError(err?.message || 'Failed to create account. Please check details.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-md bg-stone-900/90 border-stone-800">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-2">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <CardTitle>Create Owner Account</CardTitle>
          <CardDescription>Step 1 of 3: Identity Setup for nextBooq Platform</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Full Name"
              placeholder="e.g. Rachel Green"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label="Work Email"
              type="email"
              placeholder="rachel@centralperk.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Phone Number"
              type="tel"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error && <div className="text-xs text-rose-400 font-medium">{error}</div>}

            <Button type="submit" variant="secondary" className="w-full font-semibold mt-2" isLoading={isLoading}>
              Continue to Cafe Details <ArrowRight className="w-4 h-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
