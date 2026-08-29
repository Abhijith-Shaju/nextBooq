'use client';

import { useTenant } from '@/components/providers/tenant-provider';
import { Clock, ShieldCheck, Calendar, Users, Info, MapPin, Phone } from 'lucide-react';

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

      <div
        className={`grid grid-cols-1 gap-4 ${
          (() => {
            const optionalTiles = (contactPhone ? 1 : 0) + (hasAddress ? 1 : 0);
            return optionalTiles === 2
              ? 'md:grid-cols-2 lg:grid-cols-5'
              : optionalTiles === 1
                ? 'md:grid-cols-2 lg:grid-cols-4'
                : 'md:grid-cols-3';
          })()
        }`}
      >
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
            Table held for <strong className="text-brand-brown">{rules.hold_duration_minutes || 10} minutes</strong> while completing deposit payment.
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
