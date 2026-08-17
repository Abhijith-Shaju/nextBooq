'use client';

import { useBookingStore } from '@/store/use-booking-store';
import { CalendarPlus, ArrowLeft, Check } from 'lucide-react';
import Link from 'next/link';
import { useTenant } from '@/components/providers/tenant-provider';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/shared/status-badge';
import { generateIcsContent } from '@/lib/booking/ics';

export function SuccessCard() {
  const { date, time, partySize, reservation, resetBooking } = useBookingStore();
  const { cafe, tenantPath } = useTenant();

  const tokenNumber = reservation?.id ? String(reservation.id).slice(-4).toUpperCase() : '----';

  const handleAddToCalendar = () => {
    if (!date || !time) {
      toast.error('No reservation time to add to your calendar.');
      return;
    }

    const [hours, minutes] = time.split(':').map(Number);
    const start = new Date(date);
    start.setHours(hours, minutes, 0, 0);
    const durationMinutes = cafe.reservation_rules?.default_turn_time_minutes ?? 90;
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

    const icsContent = generateIcsContent({
      title: `Table booking at ${cafe.name}`,
      description: `Token #${tokenNumber} — show this at the door.`,
      location: cafe.name,
      start,
      end,
    });

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${cafe.slug}-reservation.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('Calendar event downloaded (.ics)');
  };

  return (
    <div className="mx-auto w-full max-w-md text-center">
      <div
        className="relative mx-auto mb-5 flex h-24 w-24 -rotate-6 items-center justify-center rounded-full border-[3px] border-emerald-600 text-emerald-600"
        style={{ boxShadow: 'inset 0 0 0 6px transparent' }}
      >
        <div className="absolute h-[86px] w-[86px] rounded-full border border-dashed border-emerald-600/50" />
        <Check className="h-11 w-11" strokeWidth={2.5} />
      </div>

      <h1 className="font-display text-2xl font-bold text-brand-brown">Table&rsquo;s yours</h1>
      <p className="mt-1.5 text-sm text-brand-mocha">
        Show this token at the door at <strong className="text-brand-brown">{cafe.name}</strong> &mdash; no need to print it.
      </p>

      <div className="ticket-card mt-6 text-left">
        <div className="flex flex-col items-center gap-3 p-6">
          <StatusBadge status="CONFIRMED" />
          <div className="relative h-28 w-28 rounded-lg border-2 border-brand-brown bg-white p-2">
            <div
              className="h-full w-full"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(90deg, #2C1810 0 4px, transparent 4px 8px), repeating-linear-gradient(0deg, #2C1810 0 4px, transparent 4px 8px)',
                backgroundBlendMode: 'multiply',
              }}
              aria-hidden
            />
          </div>
          <div className="font-mono text-lg font-bold tracking-wide text-brand-brown">TOKEN #{tokenNumber}</div>
        </div>

        <div className="ticket-perf" />

        <div className="ticket-field grid grid-cols-3 gap-3 p-5">
          <div>
            <div className="k">Date</div>
            <div className="v mt-0.5 text-[15px]">{date ? format(date, 'EEE d MMM') : '—'}</div>
          </div>
          <div>
            <div className="k">Time</div>
            <div className="v mt-0.5 text-[15px]">{time || '—'}</div>
          </div>
          <div>
            <div className="k">Party</div>
            <div className="v mt-0.5 text-[15px]">{partySize} guests</div>
          </div>
        </div>

        <div className="flex gap-2.5 px-5 pb-5">
          <button
            onClick={handleAddToCalendar}
            className="flex-1 rounded-xl border border-brand-brown/20 py-2.5 text-xs font-bold text-brand-brown transition-colors hover:bg-brand-tan/40"
          >
            <CalendarPlus className="mr-1.5 inline h-3.5 w-3.5" /> Add to calendar
          </button>
          <Link
            href={tenantPath('/')}
            onClick={() => resetBooking()}
            className="flex flex-1 items-center justify-center rounded-xl bg-brand-gold/15 py-2.5 text-xs font-bold text-brand-gold transition-colors hover:bg-brand-gold/25"
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Book again
          </Link>
        </div>
      </div>
    </div>
  );
}
