'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Coffee, LayoutDashboard, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { getManagerCafes, getOwnedCafesFromMemberships, getProfileRole } from '@/lib/profile/user-workspace';

function initialsFor(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/**
 * Guard + sidebar shell for /profile. Client-side check is defense-in-depth
 * (same pattern as app/org/(dashboard)/layout.tsx) — the real gate is
 * middleware.ts / route-guard.ts on every request.
 */
function ProfileGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [accountOpen, setAccountOpen] = useState(true);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      const callbackUrl = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ''}`;
      router.replace(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    }
  }, [isLoading, isAuthenticated, router, pathname, searchParams]);

  if (isLoading || !isAuthenticated || !user) {
    return null;
  }

  const role = getProfileRole(user);
  const workspaceCafes = role === 'owner' ? getOwnedCafesFromMemberships(user) : getManagerCafes(user);
  const showWorkspace = role !== 'guest';

  return (
    <div className="flex min-h-screen flex-col bg-brand-cream font-sans md:flex-row">
      <aside className="flex w-full shrink-0 flex-col justify-between border-r border-brand-brown/10 bg-white/70 p-6 backdrop-blur-sm md:w-64">
        <div className="flex flex-col gap-8">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-red shadow-brand-sm">
              <Coffee className="h-4 w-4 text-white" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-brand-brown">
              next<span className="text-brand-red">Booq</span>
            </span>
          </Link>

          <div className="flex flex-col gap-4">
            <div>
              <button
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                className="flex w-full items-center justify-between px-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-brand-mochaMid"
              >
                Account
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${accountOpen ? '' : '-rotate-90'}`} />
              </button>
              {accountOpen && (
                <nav className="flex flex-col gap-0.5">
                  <Link
                    href="/profile"
                    aria-current="page"
                    className="flex items-center gap-3 rounded-xl bg-brand-red px-4 py-2.5 text-sm font-semibold text-white shadow-brand-sm"
                  >
                    <UserIcon className="h-4 w-4" />
                    Profile
                  </Link>
                </nav>
              )}
            </div>

            {showWorkspace && (
              <div>
                <button
                  type="button"
                  onClick={() => setWorkspaceOpen((open) => !open)}
                  className="flex w-full items-center justify-between px-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-brand-mochaMid"
                >
                  Workspace
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${workspaceOpen ? '' : '-rotate-90'}`} />
                </button>
                {workspaceOpen && (
                  <nav className="flex flex-col gap-0.5">
                    {role === 'owner' && (
                      <Link
                        href="/org/dashboard"
                        className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-mocha transition-colors hover:bg-brand-tan/50 hover:text-brand-brown"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        Org Dashboard
                      </Link>
                    )}
                    {workspaceCafes.map((cafe) => (
                      <Link
                        key={cafe.slug}
                        href={`/${cafe.slug}/dashboard`}
                        className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-mocha transition-colors hover:bg-brand-tan/50 hover:text-brand-brown"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        {cafe.name}
                      </Link>
                    ))}
                  </nav>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5 border-t border-brand-brown/10 pt-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-red text-xs font-bold text-white">
              {initialsFor(user.name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-brand-brown">{user.name}</p>
              <p className="truncate text-[10px] text-brand-mochaMid">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="tone-critical flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-80"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
    </div>
  );
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ProfileGuard>{children}</ProfileGuard>
    </Suspense>
  );
}
