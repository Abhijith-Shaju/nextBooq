'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLogin } from '@/hooks/auth/use-login';
import { useRegister } from '@/hooks/auth/use-register';
import { useForgotPassword } from '@/hooks/auth/use-forgot-password';
import {
  Coffee,
  Mail,
  Lock,
  User,
  Phone,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';

export function CustomerAuthModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // 'forgot' is a third view rather than a link out to /auth/forgot-password:
  // that page lives in the control plane, so sending a guest there mid-booking
  // would drop them out of the cafe's storefront with no way back to the table
  // they were choosing.
  const [tab, setTab] = useState<'login' | 'register' | 'forgot'>('login');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);

  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const forgotPasswordMutation = useForgotPassword();

  const goToTab = (next: 'login' | 'register' | 'forgot') => {
    setTab(next);
    // A revealed password must not survive a view change -- the guest may have
    // shown it to check a typo, and it should not still be on screen when they
    // come back to the form later.
    setShowPassword(false);
    setResetRequested(false);
  };

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    forgotPasswordMutation.mutate(
      { email },
      {
        // Same outcome either way, deliberately: a different response for an
        // unknown address would turn this form into an account-enumeration
        // oracle. Matches /auth/forgot-password.
        onSuccess: () => setResetRequested(true),
        onError: () => setResetRequested(true),
      }
    );
  };

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
    if (!acceptTerms) {
      toast.error('Please accept the Terms and Conditions to continue');
      return;
    }

    registerMutation.mutate(
      { name, email, phone, password, accept_terms: true },
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
          <div className="mx-auto w-12 h-12 bg-brand-red/10 text-brand-red rounded-2xl flex items-center justify-center mb-1 shadow-brand-sm">
            <Coffee className="w-6 h-6" />
          </div>
          <DialogTitle className="text-2xl font-bold font-display text-brand-brown">
            {tab === 'login'
              ? 'Customer Log In'
              : tab === 'register'
                ? 'Create Guest Account'
                : 'Reset your password'}
          </DialogTitle>
          <DialogDescription className="text-xs text-brand-mocha">
            {tab === 'forgot'
              ? "Enter your email and we'll send you a reset link."
              : 'Access your cafe table reservations and preferences'}
          </DialogDescription>
        </DialogHeader>

        {/* Tab Toggle — hidden while resetting, which is a step out of the
            login/register choice rather than a third peer of it. */}
        {tab !== 'forgot' ? (
          <div className="flex bg-brand-tan/40 p-1 rounded-2xl border border-brand-brown/10 text-xs font-bold my-2">
            <button
              onClick={() => goToTab('login')}
              className={`flex-1 py-2 rounded-xl transition-all ${
                tab === 'login' ? 'bg-white text-brand-brown shadow-sm' : 'text-brand-mocha hover:text-brand-brown'
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => goToTab('register')}
              className={`flex-1 py-2 rounded-xl transition-all ${
                tab === 'register' ? 'bg-white text-brand-brown shadow-sm' : 'text-brand-mocha hover:text-brand-brown'
              }`}
            >
              Sign Up
            </button>
          </div>
        ) : null}

        {tab === 'forgot' ? (
          <div className="space-y-4 py-1 text-left">
            {resetRequested ? (
              <p className="text-sm text-brand-brown bg-brand-tan/40 rounded-xl p-4 text-center">
                If an account exists for that email, we&apos;ve sent a reset link. Check your inbox.
              </p>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <div>
                  <Label className="text-xs font-semibold text-brand-brown">Email Address</Label>
                  <div className="relative mt-1">
                    <Mail className="w-4 h-4 text-brand-mocha absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      type="email"
                      required
                      autoFocus
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9 text-sm"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={forgotPasswordMutation.isPending}
                  className="w-full cta-hero py-3 justify-center text-sm font-bold shadow-brand-md"
                >
                  {forgotPasswordMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...
                    </>
                  ) : (
                    <>
                      Send reset link <ArrowRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </Button>
              </form>
            )}

            <button
              type="button"
              onClick={() => goToTab('login')}
              className="flex items-center gap-1 mx-auto text-xs font-semibold text-brand-mocha hover:text-brand-brown"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to log in
            </button>
          </div>
        ) : tab === 'login' ? (
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
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-brand-brown">Password</Label>
                <button
                  type="button"
                  onClick={() => goToTab('forgot')}
                  className="text-xs font-medium text-brand-red hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative mt-1">
                <Lock className="w-4 h-4 text-brand-mocha absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-9 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-mocha hover:text-brand-brown"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
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
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-9 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-mocha hover:text-brand-brown"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Third registration path in the app, and it needs the same
                clickwrap gate as the other two -- the API refuses without it. */}
            <label className="flex items-start gap-2.5 text-[11px] text-brand-mocha cursor-pointer">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-brand-red shrink-0"
              />
              <span>
                I agree to the{' '}
                <a href="/legal/terms" target="_blank" rel="noreferrer" className="text-brand-red font-semibold hover:underline">
                  Terms
                </a>{' '}
                and{' '}
                <a href="/legal/privacy" target="_blank" rel="noreferrer" className="text-brand-red font-semibold hover:underline">
                  Privacy Policy
                </a>
                .
              </span>
            </label>

            <Button
              type="submit"
              disabled={registerMutation.isPending || !acceptTerms}
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
