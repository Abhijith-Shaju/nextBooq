'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLogin } from '@/hooks/auth/use-login';
import { useRegister } from '@/hooks/auth/use-register';
import { Coffee, Mail, Lock, User, Phone, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export function CustomerAuthModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<'login' | 'register'>('login');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const loginMutation = useLogin();
  const registerMutation = useRegister();

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }

    loginMutation.mutate(
      { email, password },
      {
        onSuccess: () => {
          toast.success('Logged in as customer');
          onOpenChange(false);
        },
      }
    );
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !phone || !password) {
      toast.error('Please fill in all required fields');
      return;
    }

    registerMutation.mutate(
      { name, email, phone, password },
      {
        onSuccess: () => {
          toast.success('Account created successfully');
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-6 rounded-3xl">
        <DialogHeader className="text-center">
          <div className="mx-auto w-10 h-10 bg-brand-red rounded-xl flex items-center justify-center mb-2 shadow-brand-md">
            <Coffee className="w-5 h-5 text-white" />
          </div>
          <DialogTitle className="text-2xl font-bold font-display text-brand-brown">
            {tab === 'login' ? 'Customer Log In' : 'Create Guest Account'}
          </DialogTitle>
          <DialogDescription className="text-xs text-brand-mocha">
            Access your cafe table reservations and preferences
          </DialogDescription>
        </DialogHeader>

        {/* Tab Toggle */}
        <div className="flex bg-brand-tan/40 p-1 rounded-2xl border border-brand-brown/10 text-xs font-bold my-2">
          <button
            onClick={() => setTab('login')}
            className={`flex-1 py-2 rounded-xl transition-all ${
              tab === 'login' ? 'bg-white text-brand-brown shadow-sm' : 'text-brand-mocha hover:text-brand-brown'
            }`}
          >
            Log In
          </button>
          <button
            onClick={() => setTab('register')}
            className={`flex-1 py-2 rounded-xl transition-all ${
              tab === 'register' ? 'bg-white text-brand-brown shadow-sm' : 'text-brand-mocha hover:text-brand-brown'
            }`}
          >
            Sign Up
          </button>
        </div>

        {tab === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4 py-1 text-left">
            <div>
              <Label className="text-xs font-semibold text-brand-brown">Email Address</Label>
              <div className="relative mt-1">
                <Mail className="w-4 h-4 text-brand-mocha absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  type="email"
                  required
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-brand-brown">Password</Label>
              <div className="relative mt-1">
                <Lock className="w-4 h-4 text-brand-mocha absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full cta-hero py-3 justify-center text-sm font-bold shadow-brand-md mt-2"
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Authenticating...
                </>
              ) : (
                <>
                  Log In <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="space-y-3 py-1 text-left">
            <div>
              <Label className="text-xs font-semibold text-brand-brown">Full Name *</Label>
              <div className="relative mt-1">
                <User className="w-4 h-4 text-brand-mocha absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  required
                  placeholder="Jane Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-brand-brown">Email Address *</Label>
              <div className="relative mt-1">
                <Mail className="w-4 h-4 text-brand-mocha absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  type="email"
                  required
                  placeholder="jane@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-brand-brown">Phone Number *</Label>
              <div className="relative mt-1">
                <Phone className="w-4 h-4 text-brand-mocha absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  type="tel"
                  required
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-brand-brown">Password *</Label>
              <div className="relative mt-1">
                <Lock className="w-4 h-4 text-brand-mocha absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full cta-hero py-3 justify-center text-sm font-bold shadow-brand-md mt-2"
            >
              {registerMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating Account...
                </>
              ) : (
                <>
                  Create Account <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
