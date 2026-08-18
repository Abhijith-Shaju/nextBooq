'use client';

import { useState, useEffect } from 'react';
import { useBookingStore } from '@/store/use-booking-store';
import { PartySizeSelect } from './party-size-select';
import { DatePicker } from './date-picker';
import { TimeSlotPicker } from './time-slot-picker';
import { AuthOverlay } from './auth-overlay';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { Calendar, Users, Clock, ArrowRight, ShieldCheck, Sparkles, UtensilsCrossed, Heart, Compass } from 'lucide-react';
import { motion } from 'framer-motion';

import { useTenant } from '@/components/providers/tenant-provider';

export function BookingCard() {
  const { cafe } = useTenant();
  const { partySize, date, time, setCafe } = useBookingStore();
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);
  const [seatingPreference, setSeatingPreference] = useState('Indoor Main Dining');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    if (cafe) {
      setCafe(cafe);
    }
  }, [cafe, setCafe]);

  if (!cafe.payments?.configured) {
    return (
      <div className="ticket-card mx-auto w-full max-w-md p-8 text-center space-y-2">
        <p className="text-base font-bold text-brand-brown">Online reservations aren&apos;t available yet</p>
        <p className="text-sm text-brand-mocha">Please contact {cafe.name} directly to book a table.</p>
      </div>
    );
  }

  const seatingOptions = [
    { id: 'Indoor Main Dining', label: 'Indoor Dining' },
    { id: 'Outdoor Patio', label: 'Outdoor Patio' },
    { id: 'Window Seat', label: 'Window Seat' },
    { id: 'Quiet Corner', label: 'Quiet Corner' },
  ];

  const handleTimeSelect = () => {
    setShowAuthOverlay(true);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="w-full max-w-4xl mx-auto glass shadow-brand-md rounded-3xl overflow-hidden border border-brand-brown/15 bg-white/95 backdrop-blur-md">
          {/* Card Header & Step Bar */}
          <div className="p-6 md:p-8 bg-gradient-to-r from-brand-tan/40 via-white to-brand-cream border-b border-brand-brown/10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-red uppercase tracking-wider mb-1" suppressHydrationWarning>
                  <Sparkles className="w-3.5 h-3.5" /> Instant Table Hold
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold font-display text-brand-brown">
                  Reserve Your Table
                </h2>
              </div>

              {/* Steps Indicator */}
              <div className="flex items-center gap-2 text-xs font-bold">
                <div className="flex items-center gap-1.5 bg-brand-brown text-white px-3 py-1.5 rounded-xl shadow-brand-sm">
                  <span>1</span>
                  <span>Guests & Date</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-brand-mocha" />
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
                  time ? 'bg-brand-red text-white shadow-brand-sm' : 'bg-brand-tan/60 text-brand-mocha'
                }`}>
                  <span>2</span>
                  <span>Time Slot</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card Content Grid */}
          <CardContent className="p-6 md:p-8 space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
              {/* Left Column: Party Size, Date & Seating Preference */}
              <div className="space-y-6">
                <PartySizeSelect />
                <DatePicker />

                {/* Seating Preference Selector */}
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-bold text-brand-brown flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-brand-red" />
                    Seating Preference
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {seatingOptions.map((opt) => {
                      const isSelected = seatingPreference === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setSeatingPreference(opt.id)}
                          className={`py-2 px-2.5 rounded-xl text-xs font-semibold text-center transition-all border ${
                            isSelected
                              ? 'bg-brand-brown text-white border-brand-brown shadow-sm'
                              : 'bg-white text-brand-brown border-brand-brown/15 hover:bg-brand-tan/40'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Time Slot Selector */}
              <div className="space-y-4 pt-2 lg:pt-0 border-t lg:border-t-0 lg:border-l border-brand-brown/10 lg:pl-8">
                <div className="flex items-center justify-between pb-2 border-b border-brand-brown/10">
                  <h3 className="font-bold font-display text-lg text-brand-brown flex items-center gap-2">
                    <Clock className="w-4 h-4 text-brand-red" />
                    Select Dining Time
                  </h3>
                  {isMounted && date && (
                    <span className="text-xs font-semibold text-brand-red bg-brand-red/10 px-2.5 py-0.5 rounded-full" suppressHydrationWarning>
                      {format(date, 'MMM d, yyyy')}
                    </span>
                  )}
                </div>

                <TimeSlotPicker onSelect={handleTimeSelect} />
              </div>
            </div>

            {/* Live Reservation Summary & Call-To-Action Footer */}
            <div className="pt-6 border-t border-brand-brown/10 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gradient-to-r from-brand-tan/20 via-white to-brand-cream p-4 rounded-2xl border border-brand-brown/10">
              <div className="flex items-center gap-3 text-xs text-brand-brown">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-bold text-brand-brown">Guaranteed Instant Table Hold</p>
                  <p className="text-[11px] text-brand-mocha" suppressHydrationWarning>
                    {partySize} Guests • {seatingPreference} {isMounted && date ? `• ${format(date, 'MMM d')}` : ''} {time ? `@ ${time}` : ''}
                  </p>
                </div>
              </div>

              {date && time ? (
                <button
                  onClick={() => setShowAuthOverlay(true)}
                  className="cta-hero py-3 px-6 text-xs font-bold shadow-brand-md whitespace-nowrap shrink-0 flex items-center gap-1.5 animate-pulse"
                >
                  Hold {time} Slot <ArrowRight className="w-4 h-4 ml-1" />
                </button>
              ) : (
                <span className="text-xs font-semibold text-brand-mocha bg-brand-tan/40 px-3 py-1.5 rounded-xl border border-brand-brown/10">
                  Pick a time slot above to hold table
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <AuthOverlay
        open={showAuthOverlay}
        onOpenChange={setShowAuthOverlay}
      />
    </>
  );
}
