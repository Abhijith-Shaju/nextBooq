import type { Metadata } from 'next'
import { Coffee, Heart, Sparkles } from 'lucide-react'

export const metadata: Metadata = {
  title: 'About Us — nextBooq',
  description: 'nextBooq powers seamless reservations and unforgettable guest experiences for cafés and restaurants everywhere.',
}

const values = [
  {
    icon: Coffee,
    title: 'Built for cafés',
    description: 'Every feature is designed around how a real café actually runs — table holds, walk-ins, and turn times that shift by the hour.',
  },
  {
    icon: Sparkles,
    title: 'Instant, reliable bookings',
    description: 'Real-time table allocation means guests get an immediate answer, and owners never overbook a table twice.',
  },
  {
    icon: Heart,
    title: 'Guest experience first',
    description: 'A smooth reservation is the first impression of a great visit — we obsess over making that first moment effortless.',
  },
]

export default function AboutPage() {
  return (
    <main className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
      <div className="text-center mb-16">
        <h1 className="font-display text-4xl sm:text-5xl font-black text-brand-brown mb-4">
          About nextBooq
        </h1>
        <p className="text-brand-mocha text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
          nextBooq is the all-in-one reservation platform for modern cafés and restaurants — built to simplify
          bookings for owners and delight guests from the first tap to the last sip.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
        {values.map(({ icon: Icon, title, description }) => (
          <div key={title} className="text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-brand-red/10 flex items-center justify-center">
              <Icon className="w-6 h-6 text-brand-red" />
            </div>
            <h2 className="font-display text-lg font-bold text-brand-brown">{title}</h2>
            <p className="text-sm text-brand-mocha leading-relaxed">{description}</p>
          </div>
        ))}
      </div>
    </main>
  )
}
