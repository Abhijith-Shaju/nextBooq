'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { cn } from '@/lib/utils';

interface AccountMenuProps {
  /** 'light' for a cream/white nav bar, 'dark' for a brand-brown nav bar. */
  theme?: 'light' | 'dark';
  /** When set, the "Log in" item calls this instead of linking to /auth/login
   *  (e.g. to open an in-page quick-auth modal on a storefront). */
  onLoginClick?: () => void;
}

const TRIGGER_STYLES: Record<'light' | 'dark', string> = {
  light: 'bg-brand-tan/50 text-brand-brown hover:bg-brand-tan',
  dark: 'bg-white/10 text-white hover:bg-white/20',
};

function initialsFor(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

export function AccountMenu({ theme = 'light', onLoginClick }: AccountMenuProps) {
  const { user, isAuthenticated, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-colors',
          isAuthenticated ? 'bg-brand-red text-white shadow-brand-sm' : TRIGGER_STYLES[theme]
        )}
      >
        {isAuthenticated && user?.name ? initialsFor(user.name) : <UserIcon className="h-4 w-4" />}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-brand-brown/10 bg-white py-1 shadow-card-hover"
        >
          {isAuthenticated ? (
            <>
              <Link
                href="/profile"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-semibold text-brand-brown transition-colors hover:bg-brand-tan/40"
              >
                <UserIcon className="h-4 w-4 text-brand-mocha" />
                View Account
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-semibold text-brand-redDark transition-colors hover:bg-brand-red/10"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </>
          ) : onLoginClick ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLoginClick();
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-semibold text-brand-brown transition-colors hover:bg-brand-tan/40"
            >
              <UserIcon className="h-4 w-4 text-brand-mocha" />
              Log in
            </button>
          ) : (
            <Link
              href="/auth/login"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-semibold text-brand-brown transition-colors hover:bg-brand-tan/40"
            >
              <UserIcon className="h-4 w-4 text-brand-mocha" />
              Log in
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
