import { Coffee, Heart, Sparkles } from 'lucide-react'

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

export default function AboutSection() {
  return (
    <section id="about" aria-labelledby="about-heading" className="scroll-mt-20 px-4 py-20 sm:scroll-mt-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-16 text-center">
          <h2 id="about-heading" className="mb-4 font-display text-4xl font-black text-brand-brown sm:text-5xl">
            About nextBooq
          </h2>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-brand-mocha sm:text-lg">
            nextBooq is the all-in-one reservation platform for modern cafés and restaurants — built to simplify
            bookings for owners and delight guests from the first tap to the last sip.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {values.map(({ icon: Icon, title, description }) => (
            <div key={title} className="space-y-3 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-red/10">
                <Icon className="h-6 w-6 text-brand-red" />
              </div>
              <h3 className="font-display text-lg font-bold text-brand-brown">{title}</h3>
              <p className="text-sm leading-relaxed text-brand-mocha">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
