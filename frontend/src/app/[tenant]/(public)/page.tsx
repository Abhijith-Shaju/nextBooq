import { TenantPublicHeader } from '@/components/booking/tenant-header';
import { Hero } from '@/components/booking/hero';
import { BookingCard } from '@/components/booking/booking-card';
import { CafeInfoCard } from '@/components/booking/cafe-info-card';
import { Coffee } from 'lucide-react';

export default function TenantPublicPage() {
  return (
    <main className="flex flex-col min-h-screen bg-brand-cream">
      <TenantPublicHeader />
      <Hero />

      {/* Reservation System Container */}
      <div className="container mx-auto px-4 py-12 -mt-16 md:-mt-24 relative z-10">
        <BookingCard />
      </div>

      {/* Dynamic Template Info Card */}
      <CafeInfoCard />

      {/* Clean Template Footer */}
      <footer className="bg-brand-brown text-white py-8 px-4 border-t border-white/10 text-center text-xs space-y-2 mt-auto">
        <div className="flex items-center justify-center gap-2 font-display text-base font-bold">
          <Coffee className="w-4 h-4 text-brand-red" />
          <span>next<span className="text-brand-red">Booq</span> System</span>
        </div>
        <p className="text-brand-tan/70 text-[11px]">
          Powered by nextBooq multi-tenant SaaS dining engine. Real-time optimistic allocation.
        </p>
      </footer>
    </main>
  );
}
