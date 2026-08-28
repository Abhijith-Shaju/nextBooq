import { LayoutGrid, Zap, ShieldCheck, CalendarCheck } from 'lucide-react'

const features = [
  {
    icon: LayoutGrid,
    title: 'Live Table View',
    description:
      "See every table's status in real time — open, held, or seated — so your host stand never has to guess.",
  },
  {
    icon: Zap,
    title: 'Instant Confirmation',
    description: 'Guests get an immediate yes or no on availability, with no back-and-forth phone calls.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure Razorpay Payouts',
    description: 'Deposits are collected and settled through Razorpay, so your payouts are reliable and fully tracked.',
  },
  {
    icon: CalendarCheck,
    title: 'No-Show Protection',
    description: 'A small deposit on booking means the guests who show up are the guests who committed.',
  },
]

export default function FeaturesSection() {
  return (
    <section
      id="features"
      className="relative overflow-hidden px-4 sm:px-6 lg:px-8 py-20 lg:py-28 scroll-mt-24"
      aria-labelledby="features-heading"
    >
      {/* Same ambient blob motif as the rest of the page, kept subtle since
          this section's job is to be scanned quickly, not lingered on. */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none select-none">
        <div
          className="absolute -top-24 -right-24 w-[360px] h-[360px] rounded-full
                     bg-brand-tan/40 blur-[100px] animate-blob-pulse motion-reduce:animate-none"
          style={{ animationDelay: '1s' }}
        />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2
            id="features-heading"
            className="font-display text-3xl sm:text-4xl font-bold text-brand-brown mb-4"
          >
            Everything your café's floor actually needs
          </h2>
          <p className="font-sans text-brand-mocha text-lg leading-relaxed max-w-2xl mx-auto">
            No spreadsheets, no phone tag, no guessing which table is free.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {features.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="flex items-start gap-4 rounded-2xl border border-brand-brown/10 bg-white/70
                         backdrop-blur-sm p-6 shadow-card-glass"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-red/10">
                <Icon className="w-5 h-5 text-brand-red" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-brand-brown mb-1.5">{title}</h3>
                <p className="text-sm text-brand-mocha leading-relaxed">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
