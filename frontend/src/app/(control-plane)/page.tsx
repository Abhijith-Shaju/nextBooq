import type { Metadata } from 'next'
import LandingHero from '@/components/marketing/LandingHero'
import FeaturesSection from '@/components/marketing/FeaturesSection'
import PricingSection from '@/components/marketing/PricingSection'
import AboutSection from '@/components/marketing/AboutSection'
import ContactSection from '@/components/marketing/ContactSection'

// ─── Page metadata ────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: 'nextBooq — Café Reservation Platform for Modern Businesses',
  description:
    'Reservation software for café owners — real-time table holds, deposit-secured bookings, and no-show protection, powered by Razorpay.',
  openGraph: {
    title: 'nextBooq — Café Reservation Platform',
    description: 'Real-time table holds, deposit-secured bookings, and no-show protection for your café.',
    type: 'website',
  },
}

// ─── Landing page ─────────────────────────────────────────────────────────────
// Server Component — no client-side data fetching.
export default function HomePage() {
  return (
    <main>
      {/* Hero section — asymmetric layout with headline, CTA, and product photography */}
      <LandingHero />

      {/* Features section — dedicated, own scroll anchor (the nav's "Features"
          link points here, not into the hero) */}
      <FeaturesSection />

      {/* Pricing section — no fabricated numbers; points to Contact until
          real plan/pricing data exists */}
      <PricingSection />

      {/* About section — mission, values, and a mid-page conversion CTA */}
      <AboutSection />

      {/* Contact section — get-in-touch form */}
      <ContactSection />
    </main>
  )
}
