import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Leaf, Star, Clock, MapPin } from 'lucide-react'

// ─── Feature pills shown below the CTA ───────────────────────────────────────
const features = [
  { icon: Star,  label: 'Premium Beans' },
  { icon: Clock, label: 'Fast Service' },
  { icon: Leaf,  label: '100% Organic' },
  { icon: MapPin,label: 'Find Us Nearby' },
]

// ─── Small floating stat cards ────────────────────────────────────────────────
const stats = [
  { value: '50K+', label: 'Happy Customers' },
  { value: '4.9★', label: 'Average Rating' },
]

export default function LandingHero() {
  return (
    <section
      className="relative min-h-screen flex items-center overflow-hidden pt-20"
      aria-labelledby="hero-headline"
    >
      {/* ── Decorative blob shapes ─────────────────────────────────────────── */}
      {/* Positioned absolutely behind the content, blurred to create soft light pools */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none select-none">
        {/* Large blush blob — top right */}
        <div
          className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full
                     bg-brand-blush/60 blur-[120px] animate-blob-pulse"
          style={{ animationDelay: '0s' }}
        />
        {/* Secondary tan blob — bottom left */}
        <div
          className="absolute -bottom-48 -left-24 w-[500px] h-[500px] rounded-full
                     bg-brand-tan/80 blur-[100px] animate-blob-pulse"
          style={{ animationDelay: '2.5s' }}
        />
        {/* Accent blush blob — center-right */}
        <div
          className="absolute top-1/3 right-1/4 w-[300px] h-[300px] rounded-full
                     bg-brand-blushLight/50 blur-[80px] animate-blob-pulse"
          style={{ animationDelay: '5s' }}
        />
        {/* Subtle red accent — far right */}
        <div
          className="absolute top-1/2 -right-16 w-[200px] h-[200px] rounded-full
                     bg-brand-red/10 blur-[60px]"
        />
      </div>

      {/* ── Main hero grid ─────────────────────────────────────────────────── */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center py-16 lg:py-24">

          {/* ── Left column — copy & CTA ──────────────────────────────────── */}
          <div className="space-y-8 animate-fade-up">

            {/* Eyebrow badge */}
            <div className="inline-flex items-center gap-2 bg-brand-blush/40 border border-brand-blush
                            text-brand-red text-sm font-semibold px-4 py-1.5 rounded-full">
              <span className="w-2 h-2 bg-brand-red rounded-full animate-pulse" />
              Now serving — across 200+ venues
            </div>

            {/* Main headline */}
            <div>
              {/* Decorative quote marks */}
              <div className="text-brand-mocha/30 font-display text-6xl leading-none mb-2 select-none" aria-hidden="true">
                ❝
              </div>
              <h1
                id="hero-headline"
                className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold text-brand-brown leading-[1.05] tracking-tight"
              >
                Coffee.{' '}
                <span className="block text-brand-red italic">The Best</span>
                <span className="block">For You.</span>
              </h1>
            </div>

            {/* Sub-tagline */}
            <p className="font-sans text-brand-mocha text-lg leading-relaxed max-w-md">
              nextBooq powers the cafés you love — seamless reservations, curated menus,
              and unforgettable experiences. Built for café owners, loved by guests.
            </p>

            {/* CTA row */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <Button variant="brand" size="xl" asChild>
                <Link href="/auth/register" className="flex items-center gap-2">
                  Get Started
                  <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </div>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-3 pt-2">
              {features.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-2 bg-white/70 backdrop-blur-sm border border-white/60
                             px-4 py-2 rounded-full text-brand-brown text-sm font-medium shadow-card-glass
                             hover:bg-white/90 transition-colors"
                >
                  <Icon className="w-4 h-4 text-brand-red" />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* ── Right column — product photography ──────────────────────────── */}
          <div className="relative flex justify-center lg:justify-end">

            {/* Large circular hero image */}
            <div className="relative">
              {/* Circle frame */}
              <div
                className="relative w-72 h-72 sm:w-96 sm:h-96 lg:w-[460px] lg:h-[460px]
                           rounded-full overflow-hidden border-4 border-white/60
                           shadow-hero-img animate-float"
              >
                {/*
                  PLACEHOLDER: Replace this Unsplash URL with your actual hero product
                  photography. Recommended: transparent-bg PNG of a coffee cup on cream
                  background, 920×920px minimum for crisp display at retina.
                */}
                <Image
                  src="https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=920&q=85&fm=webp"
                  alt="Premium handcrafted latte — hero product shot"
                  fill
                  priority
                  sizes="(max-width: 640px) 288px, (max-width: 1024px) 384px, 460px"
                  className="object-cover product-shadow"
                />
              </div>

              {/* Small floating secondary card #1 — bottom left */}
              <div
                className="absolute -bottom-4 -left-4 sm:-bottom-6 sm:-left-12
                           glass rounded-2xl p-3 shadow-card-glass
                           animate-fade-up w-40 sm:w-48"
                style={{ animationDelay: '0.3s' }}
              >
                <div className="relative w-full h-24 rounded-xl overflow-hidden mb-2">
                  {/* PLACEHOLDER: secondary product card image */}
                  <Image
                    src="https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=400&q=80&fm=webp"
                    alt="Dark Chocolate Mocha"
                    fill
                    sizes="192px"
                    className="object-cover"
                  />
                </div>
                <p className="font-display font-semibold text-brand-brown text-sm leading-tight">
                  Dark Chocolate Mocha
                </p>
              </div>

              {/* Small floating secondary card #2 — top right */}
              <div
                className="absolute -top-4 -right-2 sm:-top-6 sm:-right-10
                           glass rounded-2xl p-3 shadow-card-glass
                           animate-fade-up w-36 sm:w-44"
                style={{ animationDelay: '0.5s' }}
              >
                <div className="relative w-full h-20 rounded-xl overflow-hidden mb-2">
                  {/* PLACEHOLDER: secondary product card image */}
                  <Image
                    src="https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=400&q=80&fm=webp"
                    alt="Canadian Cappuccino"
                    fill
                    sizes="176px"
                    className="object-cover"
                  />
                </div>
                <p className="font-display font-semibold text-brand-brown text-xs leading-tight">
                  Canadian Cappuccino
                </p>
              </div>

              {/* Stat bubbles */}
              {stats.map((stat, i) => (
                <div
                  key={stat.value}
                  className={`absolute glass rounded-xl px-3 py-2 shadow-card-glass text-center animate-fade-up ${
                    i === 0
                      ? 'bottom-16 right-0 sm:-right-8 lg:-right-16'
                      : 'top-24 -left-8 sm:-left-16'
                  }`}
                  style={{ animationDelay: `${0.6 + i * 0.15}s` }}
                >
                  <p className="font-display font-bold text-brand-brown text-lg leading-none">{stat.value}</p>
                  <p className="font-sans text-brand-mocha text-xs mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Bottom wave divider ──────────────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0" aria-hidden="true">
        <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
          <path
            d="M0 40C360 80 720 0 1080 40C1260 60 1380 30 1440 40V80H0V40Z"
            fill="#F5ECD7"
            fillOpacity="0.4"
          />
        </svg>
      </div>
    </section>
  )
}
