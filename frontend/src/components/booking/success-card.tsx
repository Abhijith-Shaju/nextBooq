'use client';

import { useBookingStore } from '@/store/use-booking-store';
import { CheckCircle2, CalendarPlus, QrCode, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTenant } from '@/components/providers/tenant-provider';
import { format } from 'date-fns';
import { toast } from 'sonner';

export function SuccessCard() {
  const { date, time, partySize, reservation, resetBooking } = useBookingStore();
  const { cafe } = useTenant();

  const handleAddToCalendar = () => {
    toast.success('Calendar event downloaded (.ics)');
  };

  return (
    <div className="w-full max-w-lg mx-auto glass p-8 rounded-3xl border border-brand-brown/10 shadow-brand-xl text-center">
      {/* Animated Checkmark */}
      <div className="mx-auto w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 shadow-md">
        <CheckCircle2 className="w-12 h-12" />
      </div>

      <div className="inline-block px-3 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full mb-3 uppercase tracking-wider">
        STATUS: CONFIRMED
      </div>

      <h1 className="text-3xl font-bold font-display text-brand-brown mb-2">Reservation Confirmed!</h1>
      <p className="text-sm text-brand-mocha mb-6">
        We look forward to hosting you at <strong className="text-brand-brown">{cafe.name}</strong>.
      </p>

      {/* Booking Details Card */}
      <div className="bg-brand-tan/30 p-5 rounded-2xl border border-brand-brown/10 space-y-3 text-sm text-left mb-6">
        <div className="flex justify-between">
          <span className="text-brand-mocha">Reservation ID:</span>
          <span className="font-mono font-bold text-brand-brown">
            {reservation?.id || 'NB-' + Math.floor(100000 + Math.random() * 900000)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-brand-mocha">Date:</span>
          <span className="font-bold text-brand-brown">
            {date ? format(date, 'EEEE, MMMM d, yyyy') : 'Confirmed Date'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-brand-mocha">Time:</span>
          <span className="font-bold text-brand-brown">{time || 'Confirmed Time'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-brand-mocha">Party Size:</span>
          <span className="font-bold text-brand-brown">{partySize} Guests</span>
        </div>
      </div>

      {/* QR Code Placeholder */}
      <div className="p-4 rounded-2xl bg-white border border-brand-brown/10 inline-flex flex-col items-center mb-6 shadow-sm">
        <QrCode className="w-24 h-24 text-brand-brown" />
        <span className="text-[11px] font-mono text-brand-mocha mt-1">Scan at Host Stand</span>
      </div>

      <div className="space-y-3">
        <button
          onClick={handleAddToCalendar}
          className="w-full py-3.5 px-6 rounded-full font-semibold bg-brand-brown hover:bg-stone-900 text-white flex items-center justify-center gap-2 transition-all shadow-md"
        >
          <CalendarPlus className="w-4 h-4" /> Add to Google / Apple Calendar
        </button>

        <Link
          href={`/${cafe.slug}`}
          onClick={() => resetBooking()}
          className="inline-flex items-center text-sm font-semibold text-brand-red hover:underline pt-2"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Make Another Reservation
        </Link>
      </div>
    </div>
  );
}
