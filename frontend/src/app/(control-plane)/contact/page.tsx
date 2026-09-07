import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, Phone, MapPin, ShieldCheck } from 'lucide-react';
import { ContactForm } from '@/components/marketing/ContactForm';

export const metadata: Metadata = {
  title: 'Contact — nextBooq',
  description:
    'Reach nextBooq: support contact details, registered business address, and grievance officer.',
  alternates: { canonical: '/contact' },
};

/**
 * A standalone, linkable contact page.
 *
 * The landing page's `/#contact` anchor is fine for browsing, but Rule 5 of the
 * Consumer Protection (E-Commerce) Rules 2020 requires the seller's legal name,
 * address and contact details to be published, and payment aggregators check
 * for a reachable Contact URL during onboarding — an in-page anchor 404s the
 * moment anyone links to it directly.
 *
 * The details below are duplicated from legal/*.md rather than read from it,
 * because this page is a React tree and those are prose. `page.test.tsx`
 * asserts every value here still appears in the legal documents, so the two
 * cannot drift apart silently — a contact page naming a different address or
 * grievance officer than the published terms is worse than one that says
 * nothing, since a regulator reads both.
 */

// Sourced from legal/terms-and-conditions.md §14 and §19.
const SUPPORT = {
  email: 'nextbooq@gmail.com',
  phone: '+91 96300 23003',
  hours: 'Mon–Sat, 10:00 AM to 6:00 PM IST',
};

const BUSINESS = {
  name: 'nextBooq',
  operators: 'Abhijith Shaju, Shashank Singh and Visvatharasan Saravanan',
  address:
    'Lovely Professional University, Jalandhar-Delhi G.T. Road (NH-1), Phagwara, Punjab 144411',
  gstin: 'Not applicable; turnover is below the GST registration threshold',
};

const GRIEVANCE = {
  name: 'Shashank Singh',
  designation: 'Grievance Officer & Managing Partner',
  email: 'shashanksingh9048@gmail.com',
  phone: '+91 96300 23003',
  address:
    'Lovely Professional University, Jalandhar-Delhi G.T. Road (NH-1), Phagwara, Punjab 144411',
};

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 mt-1 shrink-0 text-brand-red" />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-mocha">{label}</p>
        {/* Tagged so page.test.tsx can collect every published detail and check
            it against legal/*.md without the test restating the values, which
            would just be a third copy to keep in step. */}
        <p data-testid="contact-detail" className="text-[15px] text-brand-brown">
          {value}
        </p>
      </div>
    </div>
  );
}

export default function ContactPage() {
  return (
    <main className="bg-brand-cream min-h-screen">
      <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-28 pb-24 md:pt-32">
        <header className="mb-10 pb-8 border-b border-brand-brown/15">
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-brand-brown tracking-tight">
            Contact us
          </h1>
          <p className="mt-2 text-brand-mocha max-w-[60ch]">
            Questions about a booking, a reservation fee, or bringing nextBooq to your café — this is the
            fastest way to reach a person.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-14">
          <div className="lg:col-span-2 space-y-8">
            <section className="space-y-4">
              <h2 className="font-display text-lg font-bold text-brand-brown">Support</h2>
              <Detail icon={Mail} label="Email" value={SUPPORT.email} />
              <Detail icon={Phone} label="Phone" value={SUPPORT.phone} />
              <Detail icon={MapPin} label="Hours" value={SUPPORT.hours} />
            </section>

            <section className="space-y-4 pt-6 border-t border-brand-brown/10">
              <h2 className="font-display text-lg font-bold text-brand-brown">Business details</h2>
              <Detail icon={ShieldCheck} label="Operated by" value={BUSINESS.operators} />
              <Detail icon={MapPin} label="Address" value={BUSINESS.address} />
              <Detail icon={ShieldCheck} label="GSTIN" value={BUSINESS.gstin} />
            </section>

            <section className="space-y-4 pt-6 border-t border-brand-brown/10">
              <h2 className="font-display text-lg font-bold text-brand-brown">Grievance Officer</h2>
              <p className="text-sm text-brand-mocha leading-relaxed">
                Appointed under the Information Technology (Intermediary Guidelines and Digital
                Media Ethics Code) Rules, 2021. Complaints are acknowledged within 24 hours and
                resolved within 15 days.
              </p>
              <Detail icon={ShieldCheck} label="Name" value={GRIEVANCE.name} />
              <Detail icon={ShieldCheck} label="Designation" value={GRIEVANCE.designation} />
              <Detail icon={Mail} label="Email" value={GRIEVANCE.email} />
              <Detail icon={Phone} label="Phone" value={GRIEVANCE.phone} />
              <Detail icon={MapPin} label="Address" value={GRIEVANCE.address} />
            </section>

            <p className="text-sm text-brand-mocha pt-4 border-t border-brand-brown/10">
              Issues with food or service at a café should be raised with that café first — their
              contact details are shown on their booking page. See our{' '}
              <Link
                href="/legal/refunds"
                className="text-brand-red font-medium underline underline-offset-2 hover:no-underline"
              >
                Cancellation and Refund Policy
              </Link>
              .
            </p>
          </div>

          <div className="lg:col-span-3">
            <div className="bg-white/70 backdrop-blur-sm border border-white/60 rounded-3xl p-6 sm:p-8 shadow-card-glass">
              <h2 className="font-display text-lg font-bold text-brand-brown mb-4">
                Send us a message
              </h2>
              <ContactForm />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
