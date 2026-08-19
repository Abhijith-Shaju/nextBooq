import type { Metadata } from 'next'
import { ContactForm } from '@/components/marketing/ContactForm'

export const metadata: Metadata = {
  title: 'Contact Us — nextBooq',
  description: 'Get in touch with the nextBooq team — questions, feedback, or partnership inquiries.',
}

export default function ContactPage() {
  return (
    <main className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto text-center">
      <h1 className="font-display text-4xl sm:text-5xl font-black text-brand-brown mb-4">
        Get in Touch
      </h1>
      <p className="text-brand-mocha text-base sm:text-lg mb-10 max-w-xl mx-auto">
        Questions about nextBooq, feedback on your experience, or interested in bringing it to your café?
        Send us a message and we&apos;ll get back to you.
      </p>
      <ContactForm />
    </main>
  )
}
