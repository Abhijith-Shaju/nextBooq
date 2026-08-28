import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function PricingSection() {
  return (
    <section
      id="pricing"
      className="relative overflow-hidden px-4 sm:px-6 lg:px-8 py-20 lg:py-28 scroll-mt-24"
      aria-labelledby="pricing-heading"
    >
      <div className="relative z-10 max-w-2xl mx-auto text-center">
        <h2
          id="pricing-heading"
          className="font-display text-3xl sm:text-4xl font-bold text-brand-brown mb-4"
        >
          Pricing built around your café
        </h2>
        <p className="font-sans text-brand-mocha text-lg leading-relaxed mb-8">
          Table count, reservation volume, and how you run service all vary café to café — so does what makes
          sense to charge for it. Tell us about your café and we&apos;ll put a plan together with you.
        </p>
        <Button variant="brand" size="xl" asChild>
          <Link href="/#contact" className="flex items-center gap-2">
            Get in touch
            <ArrowRight className="w-5 h-5" />
          </Link>
        </Button>
      </div>
    </section>
  )
}
