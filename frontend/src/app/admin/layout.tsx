'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { toast } from 'sonner';

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
export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-lg font-bold">nextBooq — Platform Admin</h1>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
