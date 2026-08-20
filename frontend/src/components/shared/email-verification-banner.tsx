'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MailWarning, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { useResendVerificationEmail } from '@/hooks/auth/use-resend-verification-email';
import { toast } from 'sonner';

// Routes where the banner should never appear (auth funnel itself).
const HIDDEN_PREFIXES = ['/auth/'];

export function EmailVerificationBanner() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const resendMutation = useResendVerificationEmail();
  const [dismissed, setDismissed] = useState(false);

  // Don't render during load, when logged out, when already verified,
  // when dismissed for the session, or on any auth-route.
  if (
    isLoading ||
    !isAuthenticated ||
    user?.is_email_verified ||
    dismissed ||
    HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return null;
  }

  const verifyHref = `/auth/verify-email?callbackUrl=${encodeURIComponent(pathname)}`;

  const handleResend = () => {
    resendMutation.mutate(undefined, {
      onSuccess: () => toast.success('Verification code sent — check your inbox.'),
      onError: () => toast.error('Could not send code. Please try again.'),
    });
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className="w-full bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-3 text-sm"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <MailWarning className="h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-amber-900 font-medium truncate">
          Please verify your email address{user?.email ? ` (${user.email})` : ''} to unlock table
          reservations.
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Link
          href={verifyHref}
          className="text-xs font-bold text-amber-800 bg-amber-200 hover:bg-amber-300 transition-colors px-3 py-1 rounded-full whitespace-nowrap"
        >
          Verify now
        </Link>
        <button
          type="button"
          onClick={handleResend}
          disabled={resendMutation.isPending}
          className="text-xs text-amber-700 hover:text-amber-900 underline disabled:opacity-50 whitespace-nowrap"
        >
          {resendMutation.isPending ? 'Sending…' : 'Resend code'}
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          className="text-amber-500 hover:text-amber-800 transition-colors ml-1"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
