'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api-client';
import { KeyRound, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export function SigninView() {
  const router = useRouter();
  const { setIdentity } = useOnboardingStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // Login user
      const response = await apiClient('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (response?.data?.user) {
        setIdentity({
          name: response.data.user.name,
          email: response.data.user.email,
          phone: response.data.user.phone,
        });
        
        // Check if user has memberships, otherwise direct to cafe setup
        if (response.data.user.staff_memberships?.length > 0) {
          router.push('/dashboard'); // or appropriate redirect based on app logic
        } else {
          router.push('/onboarding/cafe');
        }
      } else {
        setError('Login successful, but user data is missing.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to sign in. Please check credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-md bg-stone-900/90 border-stone-800">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-2">
            <KeyRound className="w-6 h-6" />
          </div>
          <CardTitle>Sign In</CardTitle>
          <CardDescription>Welcome back to nextBooq Platform</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Work Email"
              type="email"
              placeholder="rachel@centralperk.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              Sign In <ArrowRight className="w-4 h-4" />
            </Button>
            
            <div className="text-center text-sm text-stone-400 mt-4">
              Don't have an account?{' '}
              <Link href="/signup" className="text-amber-400 hover:text-amber-300 font-medium transition-colors">
                Sign Up
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
