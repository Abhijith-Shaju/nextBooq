'use client';

import { useTenant } from '@/components/providers/tenant-provider';
import { Clock, ShieldCheck, Calendar, Users, Info, MapPin, Phone, IndianRupee } from 'lucide-react';

export function CafeInfoCard() {
  const { cafe } = useTenant();

  const rules = cafe.reservation_rules || {};
  const contactPhone = cafe.contact_phone?.trim();

  const address = cafe.address;
  const hasAddress = Boolean(address?.line1?.trim());
  const addressLine = hasAddress
    ? [address?.line1, address?.line2, address?.landmark, address?.city, address?.state, address?.postal_code]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(', ')
    : '';
  const mapUrl = address?.map_url?.trim();

  return (
    <section className="py-12 max-w-4xl mx-auto w-full px-4 space-y-6">
      <div className="text-center space-y-1">
        <h3 className="font-display text-2xl font-bold text-brand-brown">
          Dining Policies & Guest Information
        </h3>
        <p className="text-xs text-brand-mocha">
          Real-time reservation terms for {cafe.name}
        </p>
      </div>

      {/* Fixed three-up rather than one column per tile. The tile count now
          ranges from four to six (the reservation-fee tile plus the optional
          contact and address ones), and a five- or six-column row squeezes
          these paragraphs to an unreadable width on a laptop. Wrapping into
          two rows keeps every tile the same size whatever the cafe has
          configured. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="glass p-5 rounded-3xl border border-brand-brown/10 shadow-brand-sm space-y-2">
          <div className="w-9 h-9 bg-brand-red/10 text-brand-red rounded-xl flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <h4 className="font-bold font-display text-sm text-brand-brown">Dining Duration</h4>
          <p className="text-xs text-brand-mocha leading-relaxed">
            Standard seating window of <strong className="text-brand-brown">{rules.default_turn_time_minutes || 90} minutes</strong> per party.
          </p>
        </div>

        <div className="glass p-5 rounded-3xl border border-brand-brown/10 shadow-brand-sm space-y-2">
          <div className="w-9 h-9 bg-brand-red/10 text-brand-red rounded-xl flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h4 className="font-bold font-display text-sm text-brand-brown">Hold Protection</h4>
          <p className="text-xs text-brand-mocha leading-relaxed">
            Table held for <strong className="text-brand-brown">{rules.hold_duration_minutes || 10} minutes</strong> while you complete payment.
          </p>
        </div>

        {/* The fee terms have to be visible before the guest commits, not only
            on the checkout screen -- they are the part of this flow a guest is
            most likely to dispute afterwards. */}
        <div className="glass p-5 rounded-3xl border border-brand-brown/10 shadow-brand-sm space-y-2">
          <div className="w-9 h-9 bg-brand-red/10 text-brand-red rounded-xl flex items-center justify-center">
            <IndianRupee className="w-5 h-5" />
          </div>
          <h4 className="font-bold font-display text-sm text-brand-brown">Reservation Fee</h4>
          <p className="text-xs text-brand-mocha leading-relaxed">
            {(rules.fee_adjusted_against_bill ?? true) ? (
              <>Adjusted against your bill at the cafe.</>
            ) : (
              <><strong className="text-brand-brown">Charged separately</strong> &mdash; not deducted from your bill.</>
            )}{' '}
            {(rules.refund_on_cancellation ?? true) ? (
              <>
                Refundable if you cancel at least{' '}
                <strong className="text-brand-brown">{rules.cancellation_cutoff_hours ?? 24} hours</strong> ahead.
              </>
            ) : (
              <><strong className="text-brand-brown">Non-refundable</strong> once paid.</>
            )}
          </p>
        </div>

        <div className="glass p-5 rounded-3xl border border-brand-brown/10 shadow-brand-sm space-y-2">
          <div className="w-9 h-9 bg-brand-red/10 text-brand-red rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <h4 className="font-bold font-display text-sm text-brand-brown">Group Capacity</h4>
          <p className="text-xs text-brand-mocha leading-relaxed">
            Accepting online groups up to <strong className="text-brand-brown">{rules.max_party_size || 12} guests</strong> with automatic table merging.
          </p>
        </div>

        {contactPhone && (
          <div className="glass p-5 rounded-3xl border border-brand-brown/10 shadow-brand-sm space-y-2">
            <div className="w-9 h-9 bg-brand-red/10 text-brand-red rounded-xl flex items-center justify-center">
              <Phone className="w-5 h-5" />
            </div>
            <h4 className="font-bold font-display text-sm text-brand-brown">Contact & Support</h4>
            <p className="text-xs text-brand-mocha leading-relaxed">
              Have a question or an issue?{' '}
              <a href={`tel:${contactPhone}`} className="font-semibold text-brand-brown underline decoration-brand-red/40 underline-offset-2">
                Call {contactPhone}
              </a>{' '}
              directly.
            </p>
          </div>
        )}

        {hasAddress && (
          <div className="glass p-5 rounded-3xl border border-brand-brown/10 shadow-brand-sm space-y-2">
            <div className="w-9 h-9 bg-brand-red/10 text-brand-red rounded-xl flex items-center justify-center">
              <MapPin className="w-5 h-5" />
            </div>
            <h4 className="font-bold font-display text-sm text-brand-brown">Find Us</h4>
            <p className="text-xs text-brand-mocha leading-relaxed">
              {mapUrl ? (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-brand-brown underline decoration-brand-red/40 underline-offset-2"
                >
                  {addressLine}
                </a>
              ) : (
                addressLine
              )}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
