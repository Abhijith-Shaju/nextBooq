'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Coffee } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { AccountMenu } from '@/components/shared/account-menu';
import { toast } from 'sonner';

/**
 * Org-owner shell for /org/dashboard. Client-side check is defense-in-depth,
 * same pattern as app/admin/layout.tsx: the real gate is server-side
 * (requireOrgOwner on every /api/v1/org/* route). This just avoids rendering
 * the shell before that would 403.
 *
 * Styled to match the rest of the org owner's authenticated experience
 * (login/register/forgot-password/verify-email) rather than the deliberately
 * unbranded /admin shell — this is the owner's own account surface, not
 * nextBooq's internal operator tool.
 */
function OrgDashboardGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      const callbackUrl = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ''}`;
      router.replace(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }
    if (!user?.owner_org_id) {
      toast.error("You don't have access to this area.");
      router.replace('/');
    }
  }, [isLoading, isAuthenticated, user, router, pathname, searchParams]);

  if (isLoading || !isAuthenticated || !user?.owner_org_id) {
    return null;
  }

  return (
    <div className="min-h-screen bg-brand-cream">
      <header className="sticky top-0 z-10 border-b border-brand-brown/10 bg-brand-cream/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/org/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-red shadow-brand-sm">
              <Coffee className="h-4 w-4 text-white" />
            </div>
            <span className="flex items-baseline gap-2">
              <span className="font-display text-lg font-bold tracking-tight text-brand-brown">
                next<span className="text-brand-red">Booq</span>
              </span>
              <span className="hidden text-sm font-medium text-brand-mocha sm:inline">Organization</span>
            </span>
          </Link>

          <div className="flex items-center gap-3 sm:gap-4">
            {user?.name && (
              <span className="hidden max-w-[10rem] truncate text-sm text-brand-mocha sm:inline">{user.name}</span>
            )}
            <AccountMenu theme="light" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}

export default function OrgDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <OrgDashboardGuard>{children}</OrgDashboardGuard>
    </Suspense>
  );
}
