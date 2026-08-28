import { ContactForm } from '@/components/marketing/ContactForm'

export default function ContactSection() {
  return (
    <section
      id="contact"
      className="relative overflow-hidden px-4 sm:px-6 lg:px-8 pb-24 scroll-mt-24"
      aria-labelledby="contact-heading"
    >
      {/* Same ambient blob field as the hero and about section, tapering off
          before the footer so the page's energy fades out gradually. */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none select-none">
        <div
          className="absolute top-1/3 -right-40 w-[380px] h-[380px] rounded-full
                     bg-brand-blush/20 blur-[110px] animate-blob-pulse motion-reduce:animate-none"
          style={{ animationDelay: '1.5s' }}
        />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-16">
        <div className="lg:col-span-2">
          <h2
            id="contact-heading"
            className="font-display text-3xl sm:text-4xl font-bold text-brand-brown mb-4"
          >
            Get in touch
          </h2>
          <p className="text-brand-mocha text-base leading-relaxed max-w-[48ch]">
            Questions about nextBooq, feedback on your experience, or interested in bringing it to your café?
            Send us a message and we&apos;ll get back to you.
          </p>
        </div>

        <div className="lg:col-span-3 bg-white/70 backdrop-blur-sm border border-white/60 rounded-3xl p-6 sm:p-8 shadow-card-glass">
          <ContactForm />
        </div>
      </div>
    </section>
  )
}
