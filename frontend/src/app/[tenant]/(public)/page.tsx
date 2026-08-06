import { Hero } from '@/components/booking/hero';
import { BookingCard } from '@/components/booking/booking-card';

export default function TenantPublicPage() {
  return (
    <main className="flex flex-col min-h-screen">
      <Hero />
      <div className="container mx-auto px-4 py-12 -mt-16 md:-mt-24 relative z-10">
        <BookingCard />
      </div>
    </main>
  );
}
