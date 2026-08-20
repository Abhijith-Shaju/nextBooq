import { ContactForm } from './ContactForm'

export default function ContactSection() {
  return (
    <section id="contact" aria-labelledby="contact-heading" className="scroll-mt-20 bg-white/20 px-4 py-20 sm:scroll-mt-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h2 id="contact-heading" className="mb-4 font-display text-4xl font-black text-brand-brown sm:text-5xl">
          Get in Touch
        </h2>
        <p className="mx-auto mb-10 max-w-xl text-base text-brand-mocha sm:text-lg">
          Questions about nextBooq, feedback on your experience, or interested in bringing it to your café? Send us a
          message and we&apos;ll get back to you.
        </p>
        <ContactForm />
      </div>
    </section>
  )
}
