'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTenant } from '@/components/providers/tenant-provider';
import { useAuth } from '@/components/providers/auth-provider';
import { CustomerAuthModal } from '@/components/auth/customer-auth-modal';
import { Coffee, User, Calendar, LogOut, Shield } from 'lucide-react';

export function TenantPublicHeader() {
  const { cafe } = useTenant();
  const { isAuthenticated, user, logout } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  return (
    <>
      <header className="w-full bg-brand-brown/95 backdrop-blur-md text-white border-b border-white/10 sticky top-0 z-50 px-4 md:px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Cafe Brand */}
          <Link href={`/${cafe.slug}`} className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 bg-brand-red rounded-xl flex items-center justify-center text-white shadow-brand-md transition-transform group-hover:scale-105">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <span className="font-display font-bold text-lg leading-none block">{cafe.name}</span>
              <span className="text-[10px] font-mono text-brand-tan/80">nextBooq Storefront</span>
            </div>
          </Link>

          {/* Navigation Links & Customer Auth */}
          <div className="flex items-center gap-3">
            <Link
              href={`/${cafe.slug}/my-reservations`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-brand-tan hover:text-white hover:bg-white/10 transition-all"
            >
              <Calendar className="w-3.5 h-3.5" /> My Bookings
            </Link>

            {isAuthenticated ? (
              <div className="flex items-center gap-2 pl-2 border-l border-white/15">
                <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl text-xs">
                  <div className="w-5 h-5 rounded-full bg-brand-red flex items-center justify-center font-bold text-[10px]">
                    {user?.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <span className="font-semibold max-w-[100px] truncate">{user?.name}</span>
                </div>

                <button
                  onClick={() => logout()}
                  title="Sign Out"
                  className="p-1.5 rounded-xl hover:bg-rose-500/20 text-rose-300 hover:text-rose-100 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-1.5 bg-brand-red hover:bg-brand-red/90 text-white px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-brand-sm"
              >
                <User className="w-3.5 h-3.5" /> Guest Sign In
              </button>
            )}

            {/* Operator Login Quicklink */}
            <Link
              href="/auth/login"
              title="Staff / Operator Login"
              className="p-1.5 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-colors ml-1"
            >
              <Shield className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      <CustomerAuthModal open={isAuthModalOpen} onOpenChange={setIsAuthModalOpen} />
    </>
  );
}
