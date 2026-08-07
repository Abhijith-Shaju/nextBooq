'use client';

import { useTenant } from '@/components/providers/tenant-provider';
import { Clock, ShieldCheck, Calendar, Users, Info, MapPin } from 'lucide-react';

export function CafeInfoCard() {
  const { cafe } = useTenant();

  const rules = cafe.reservation_rules || {};

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      </div>
    </section>
  );
}
