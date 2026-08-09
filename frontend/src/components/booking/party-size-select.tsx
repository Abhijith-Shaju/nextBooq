'use client';

import { useBookingStore } from '@/store/use-booking-store';
import { useTenant } from '@/components/providers/tenant-provider';
import { stepPartySize } from '@/lib/booking/party-size';
import { Minus, Plus } from 'lucide-react';

export function PartySizeSelect() {
  const { partySize, setPartySize } = useBookingStore();
  const { cafe } = useTenant();
  const maxPartySize = cafe.reservation_rules?.max_party_size ?? 12;

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 items-center rounded-xl bg-white shadow-card overflow-hidden">
        <button
          type="button"
          aria-label="Decrease party size"
          onClick={() => setPartySize(stepPartySize(partySize, -1, maxPartySize))}
          disabled={partySize <= 1}
          className="flex h-12 w-11 items-center justify-center text-brand-red hover:bg-brand-red/10 disabled:text-brand-mochaMid disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="flex-1 text-center">
          <span className="font-mono font-bold text-base tabular-nums text-brand-brown">{partySize}</span>
          <span className="block text-[10px] uppercase tracking-wide text-brand-mochaMid">
            {partySize === 1 ? 'guest' : 'guests'}
          </span>
        </div>
        <button
          type="button"
          aria-label="Increase party size"
          onClick={() => setPartySize(stepPartySize(partySize, 1, maxPartySize))}
          disabled={partySize >= maxPartySize}
          className="flex h-12 w-11 items-center justify-center text-brand-red hover:bg-brand-red/10 disabled:text-brand-mochaMid disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <span
        className="shrink-0 rounded-xl border border-brand-brown/15 px-3 py-3 text-xs font-medium text-brand-mocha"
        title={`Maximum party size for this cafe is ${maxPartySize}`}
      >
        max {maxPartySize}
      </span>
    </div>
  );
}
