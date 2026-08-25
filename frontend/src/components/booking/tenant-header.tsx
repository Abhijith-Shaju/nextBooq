'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTenant } from '@/components/providers/tenant-provider';
import { CustomerAuthModal } from '@/components/auth/customer-auth-modal';
import { AccountMenu } from '@/components/shared/account-menu';
import { EmailVerificationBanner } from '@/components/shared/email-verification-banner';
import { Coffee, Calendar, Shield } from 'lucide-react';

export function TenantPublicHeader() {
  const { cafe } = useTenant();
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
          <div className="flex items-center gap-1 sm:gap-3 shrink-0">
            <Link
              href={`/${cafe.slug}/my-reservations`}
              title="My Bookings"
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl text-xs font-semibold text-brand-tan hover:text-white hover:bg-white/10 transition-all"
            >
              <Calendar className="w-3.5 h-3.5" /> <span className="hidden sm:inline">My Bookings</span>
            </Link>

            <div className="pl-1 sm:pl-2 border-l border-white/15">
              <AccountMenu
                theme="dark"
                onLoginClick={() => setIsAuthModalOpen(true)}
                logoutRedirectTo={`/${cafe.slug}`}
              />
            </div>

            {/* Operator Login Quicklink */}
            <Link
              href="/auth/login"
              title="Staff / Operator Login"
              className="p-1.5 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <Shield className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      <EmailVerificationBanner className="sticky top-16 md:top-[60px] z-40" />

      <CustomerAuthModal open={isAuthModalOpen} onOpenChange={setIsAuthModalOpen} />
    </>
  );
}
