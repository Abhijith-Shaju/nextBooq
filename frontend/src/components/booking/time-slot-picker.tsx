'use client';

import { useEffect } from 'react';
import { useBookingStore } from '@/store/use-booking-store';
import { useTenant } from '@/components/providers/tenant-provider';
import { useAvailability } from '@/hooks/public/use-availability';
import { describeSlot } from '@/lib/booking/slot';
import { getLeadTimeDisabledBefore } from '@/lib/timezone';
import { Clock } from 'lucide-react';

export function TimeSlotPicker({ onSelect }: { onSelect: () => void }) {
  const { cafe } = useTenant();
  const { date, setDate, partySize, time, setTime } = useBookingStore();
  const holdDurationMinutes = cafe.reservation_rules?.hold_duration_minutes ?? 10;
  const leadTimeHours = cafe.reservation_rules?.booking_lead_time_hours ?? 24;

  // Auto-initialize date to the earliest lead-time-eligible day if not set,
  // so time slots load automatically without defaulting to a "today" that
  // the backend would reject as too soon.
  useEffect(() => {
    if (!date) {
      setDate(getLeadTimeDisabledBefore(leadTimeHours));
    }
  }, [date, setDate, leadTimeHours]);

  const { data: slots = [], isLoading, isError } = useAvailability(cafe?.id, date, partySize);

  if (!date) {
    return (
      <div className="flex flex-col items-center justify-center h-56 text-center rounded-2xl border-2 border-dashed border-brand-brown/15 bg-white/40 p-6">
        <Clock className="mb-3 h-8 w-8 text-brand-red/60" />
        <p className="font-display font-bold text-brand-brown">Select a date &amp; party size</p>
        <p className="mt-1 text-xs text-brand-mocha">Today&rsquo;s token board will fill in as soon as you do.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-brand-tan/40 p-3.5">
        <div className="grid grid-cols-3 gap-2.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-white/60" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-56 text-center rounded-2xl border border-red-200 bg-red-50 p-6">
        <Clock className="mx-auto mb-2 h-7 w-7 text-red-400" />
        <p className="text-sm font-bold text-red-700">Couldn&rsquo;t load time slots</p>
        <p className="mx-auto mt-1 max-w-xs text-xs text-red-600">
          Please try again in a moment.
        </p>
      </div>
    );
  }

  if (!slots || slots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-56 text-center rounded-2xl border border-brand-brown/10 bg-white/60 p-6">
        <Clock className="mx-auto mb-2 h-7 w-7 text-brand-mochaMid" />
        <p className="text-sm font-bold text-brand-brown">No available slots for this selection</p>
        <p className="mx-auto mt-1 max-w-xs text-xs text-brand-mocha">
          Try adjusting your party size or choosing another dining date.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="font-display text-sm font-bold text-brand-brown">Today&rsquo;s token board</h2>
        <span className="font-mono text-xs text-brand-mochaMid">
          party of {partySize}
        </span>
      </div>
      <div className="rounded-2xl bg-brand-tan/40 p-3.5 shadow-[inset_0_2px_6px_rgba(44,24,16,0.10)]">
        <div className="grid grid-cols-3 gap-2.5">
          {slots.map((slot) => {
            const { label, sublabel, selectable } = describeSlot(slot, holdDurationMinutes);
            const isSelected = time === slot.time;
            return (
              <button
                key={slot.time}
                type="button"
                disabled={!selectable}
                aria-pressed={isSelected}
                onClick={() => {
                  setTime(slot.time);
                  onSelect();
                }}
                className={`flex flex-col items-center justify-center rounded-xl border py-2.5 transition-all ${
                  isSelected
                    ? 'border-brand-redDark bg-brand-red text-white shadow-brand-sm'
                    : selectable
                    ? 'border-transparent bg-white text-brand-brown hover:-translate-y-0.5 hover:border-brand-gold shadow-sm'
                    : 'border-transparent bg-transparent text-brand-mochaMid cursor-not-allowed'
                }`}
              >
                <span className={`font-mono font-bold text-sm tabular-nums ${!selectable && 'line-through decoration-brand-mochaMid/60'}`}>
                  {label}
                </span>
                <span className={`mt-0.5 text-[9.5px] ${isSelected ? 'text-white/85' : 'text-brand-mochaMid'}`}>
                  {sublabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-brand-mochaMid">
        Tap a time to hold it &mdash; you&rsquo;ll have {holdDurationMinutes} minutes to confirm with a deposit.
      </p>
    </div>
  );
}
