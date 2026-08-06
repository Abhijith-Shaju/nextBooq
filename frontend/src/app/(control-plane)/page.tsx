import type { Metadata } from 'next'
import LandingHero from '@/components/marketing/LandingHero'
import FeaturedMenuCarousel from '@/components/marketing/FeaturedMenuCarousel'
import { menuItems } from '@/components/marketing/menuItems'

// ─── Page metadata ────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: 'nextBooq — Café Reservation Platform for Modern Businesses',
  description:
    'Power your café with nextBooq — seamless reservations, curated digital menus, and unforgettable guest experiences. Join 200+ venues already using nextBooq.',
  openGraph: {
    title: 'nextBooq — Café Reservation Platform',
    description: 'Seamless reservations, curated menus, and unforgettable guest experiences.',
    type: 'website',
  },
}

// ─── Landing page ─────────────────────────────────────────────────────────────
// Server Component — no client-side data fetching.
// Interactive state lives entirely inside FeaturedMenuCarousel ("use client").
export default function HomePage() {
  return (
    <main>
      {/* Hero section — asymmetric layout with headline, CTA, and product photography */}
      <LandingHero />

      {/* Featured menu carousel — interactive glassmorphism card morphing */}
      <FeaturedMenuCarousel items={menuItems} />

      {/* TODO: testimonials section */}
      {/* TODO: app download / mobile CTA section */}
    </main>
  )
}
