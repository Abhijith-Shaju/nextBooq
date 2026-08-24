import type { Metadata } from 'next'
import LandingHero from '@/components/marketing/LandingHero'
import AboutSection from '@/components/marketing/AboutSection'
import ContactSection from '@/components/marketing/ContactSection'

// ─── Page metadata ────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: 'nextBooq — Café Reservation Platform for Modern Businesses',
  description:
    'Power your café with nextBooq — seamless reservations and unforgettable guest experiences. Join 200+ venues already using nextBooq.',
  openGraph: {
    title: 'nextBooq — Café Reservation Platform',
    description: 'Seamless reservations and unforgettable guest experiences.',
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

      {/* About section — mission, values, and a mid-page conversion CTA */}
      <AboutSection />

      {/* Contact section — get-in-touch form */}
      <ContactSection />
    </main>
  )
}
