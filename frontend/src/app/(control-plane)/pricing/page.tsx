import type { Metadata } from 'next';
import { PricingCards } from '@/components/control-plane/pricing-cards';

export const metadata: Metadata = {
  title: 'Pricing & Subscription Plans — nextBooq',
  description: 'Choose the right nextBooq plan for your cafe — Starter, Professional, or Enterprise.',
};

export default function PricingPage() {
  return (
    <div className="py-16 md:py-24">
      <div className="text-center max-w-3xl mx-auto px-4 mb-16">
        <h1 className="text-4xl sm:text-5xl font-extrabold font-display text-brand-brown tracking-tight mb-4">
          Transparent Pricing for Fine Cafes
        </h1>
        <p className="text-lg text-brand-mocha">
          Scale your reservation volume, floorplan inventory, and guest retention with zero hidden fees.
        </p>
      </div>

      <PricingCards interactive={false} />
    </div>
  );
}
