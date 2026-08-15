'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { toast } from 'sonner';

/**
 * Org-owner shell for /org/dashboard. Client-side check is defense-in-depth,
 * same pattern as app/admin/layout.tsx: the real gate is server-side
 * (requireOrgOwner on every /api/v1/org/* route). This just avoids rendering
 * the shell before that would 403.
 */
export default function OrgDashboardLayout({ children }: { children: React.ReactNode }) {
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
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-lg font-bold">Your Organization</h1>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
