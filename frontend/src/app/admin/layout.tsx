'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { toast } from 'sonner';
import { LogOut } from 'lucide-react';
import { EmailVerificationBanner } from '@/components/shared/email-verification-banner';

/**
 * Platform-admin shell: nextBooq's own operator surface, not tenant-branded
 * (no TenantThemeProvider, no cafe colors — this page looks the same
 * regardless of which cafe you're looking at).
 *
 * This client-side check is defense-in-depth, same pattern as
 * [tenant]/(dashboard)/layout.tsx: the real gate is server-side
 * (requirePlatformAdmin on every /api/v1/platform-admin/* route). This just
 * avoids rendering the shell before that would 403.
 */
function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      const callbackUrl = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ''}`;
      router.replace(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }
    if (!user?.is_platform_admin) {
      toast.error("You don't have access to this area.");
      router.replace('/');
    }
  }, [isLoading, isAuthenticated, user, router, pathname, searchParams]);

  if (isLoading || !isAuthenticated || !user?.is_platform_admin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">nextBooq — Platform Admin</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{user?.email}</span>
          <button
            onClick={() => logout?.()}
            className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </header>
      <EmailVerificationBanner className="sticky top-0 z-40" />
      <main className="p-6">{children}</main>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AdminGuard>{children}</AdminGuard>
    </Suspense>
  );
}
