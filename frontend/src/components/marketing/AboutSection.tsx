import Link from 'next/link'
import { Coffee, Heart, Sparkles, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

const values = [
  {
    icon: Coffee,
    title: 'Built for cafés',
    description: 'Every feature is designed around how a real café actually runs — table holds, walk-ins, and turn times that shift by the hour.',
  },
  {
    icon: Sparkles,
    title: 'Instant, reliable bookings',
    description: 'Real-time table allocation means you get instant confirmation on every booking, and you never double-book a table again.',
  },
  {
    icon: Heart,
    title: 'Fewer no-shows, more revenue',
    description: 'A missed reservation is lost revenue and an empty table — deposit-secured bookings mean guests who commit actually show up.',
  },
]

export default function AboutSection() {
  return (
    <section
      id="about"
      className="relative overflow-hidden bg-cream-gradient px-4 sm:px-6 lg:px-8 py-20 lg:py-28 scroll-mt-24"
      aria-labelledby="about-heading"
    >
      {/* Decorative blob field — continues the hero's ambient motif so the
          transition out of the hero doesn't read as a hard cut. */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none select-none">
        <div
          className="absolute -top-40 -right-32 w-[420px] h-[420px] rounded-full
                     bg-brand-blush/30 blur-[110px] animate-blob-pulse"
        />
        <div
          className="absolute -top-24 -left-40 w-[380px] h-[380px] rounded-full
                     bg-brand-tan/50 blur-[100px] animate-blob-pulse"
          style={{ animationDelay: '3s' }}
        />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto">
        <h2
          id="about-heading"
          className="font-display text-3xl sm:text-4xl font-bold text-brand-brown mb-4"
        >
          About nextBooq
        </h2>
        <p className="font-sans text-brand-mocha text-lg leading-relaxed max-w-[65ch] mb-10">
          nextBooq is the all-in-one reservation platform for modern cafés and restaurants — built to fill
          every table, cut down no-shows, and put you back in control of your floor.
        </p>

        <div className="text-brand-mocha/30 font-display text-5xl leading-none mb-1 select-none" aria-hidden="true">
          ❝
        </div>
        <p className="font-display text-xl sm:text-2xl text-brand-brown leading-snug italic mb-14">
          A great café visit starts before a guest ever walks in the door — it starts the moment they
          know a table is waiting for them.
        </p>

        <div className="divide-y divide-brand-tan/70 mb-16">
          {values.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex items-start gap-6 py-9">
              <div className="w-14 h-14 shrink-0 rounded-2xl bg-brand-red/10 flex items-center justify-center">
                <Icon className="w-7 h-7 text-brand-red" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-brand-brown mb-1.5">{title}</h3>
                <p className="text-base text-brand-mocha leading-relaxed max-w-[62ch]">{description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA panel */}
        <div className="relative rounded-[2.5rem] overflow-hidden bg-brand-gradient-soft px-8 py-16 sm:py-20 text-center">
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none select-none">
            <div className="absolute -top-16 -left-16 w-72 h-72 rounded-full bg-white/10 blur-[80px]" />
            <div className="absolute -bottom-20 -right-10 w-80 h-80 rounded-full bg-white/10 blur-[90px]" />
          </div>
          <div className="relative z-10">
            <h3 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4">
              Bring nextBooq to your café
            </h3>
            <p className="font-sans text-white/80 text-base sm:text-lg max-w-xl mx-auto mb-8">
              Set up in minutes and start turning every reservation into a table that actually fills.
            </p>
            <Button variant="brand" size="xl" asChild className="bg-white text-brand-red hover:bg-white/90 hover:text-brand-redDark shadow-none">
              <Link href="/auth/register" className="flex items-center gap-2">
                Get Started
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
