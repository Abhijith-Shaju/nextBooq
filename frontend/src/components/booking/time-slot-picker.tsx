'use client';

import { useState, useEffect } from 'react';
import { useBookingStore } from '@/store/use-booking-store';
import { useTenant } from '@/components/providers/tenant-provider';
import { useAvailability } from '@/hooks/public/use-availability';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Sun, Moon, CheckCircle2 } from 'lucide-react';

export function TimeSlotPicker({ onSelect }: { onSelect: () => void }) {
  const { cafe } = useTenant();
  const { date, setDate, partySize, time, setTime } = useBookingStore();

  // Auto-initialize date to Today if not set so time slots load automatically
  useEffect(() => {
    if (!date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      setDate(today);
    }
  }, [date, setDate]);

  const { data: slots = [], isLoading } = useAvailability(cafe?.id, date, partySize);
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'lunch' | 'dinner'>('all');

  if (!date) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-brand-mocha border-2 border-dashed border-brand-brown/15 rounded-3xl p-6 text-center bg-white/40">
        <Clock className="w-10 h-10 mb-3 text-brand-red/60 animate-pulse" />
        <p className="font-display font-bold text-brand-brown text-base">Select a date & party size</p>
        <p className="text-xs text-brand-mocha mt-1">Available dining slots will update in real time.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-brand-tan/40 animate-pulse rounded-2xl" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-12 bg-brand-tan/30 animate-pulse rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!slots || slots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-brand-mocha bg-white/60 border border-brand-brown/10 rounded-3xl p-6 text-center space-y-2">
        <Clock className="w-8 h-8 text-brand-mocha/50 mx-auto" />
        <p className="font-bold text-brand-brown text-sm">No available slots for this selection</p>
        <p className="text-xs text-brand-mocha max-w-xs mx-auto">
          Try adjusting your party size or choosing another dining date.
        </p>
      </div>
    );
  }

  // Categorize slots
  const filteredSlots = slots.filter((slot) => {
    if (filterPeriod === 'all') return true;
    const hour = parseInt(slot.time.split(':')[0], 10);
    if (filterPeriod === 'lunch') return hour >= 11 && hour < 16;
    if (filterPeriod === 'dinner') return hour >= 16 || hour < 4;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Period Filter Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-brand-tan/30 rounded-2xl border border-brand-brown/10 text-xs font-bold">
        <button
          onClick={() => setFilterPeriod('all')}
          className={`flex-1 py-1.5 rounded-xl transition-all ${
            filterPeriod === 'all'
              ? 'bg-brand-brown text-white shadow-brand-sm'
              : 'text-brand-mocha hover:text-brand-brown'
          }`}
        >
          All Slots ({slots.length})
        </button>
        <button
          onClick={() => setFilterPeriod('lunch')}
          className={`flex-1 py-1.5 rounded-xl transition-all flex items-center justify-center gap-1 ${
            filterPeriod === 'lunch'
              ? 'bg-brand-brown text-white shadow-brand-sm'
              : 'text-brand-mocha hover:text-brand-brown'
          }`}
        >
          <Sun className="w-3.5 h-3.5" /> Lunch
        </button>
        <button
          onClick={() => setFilterPeriod('dinner')}
          className={`flex-1 py-1.5 rounded-xl transition-all flex items-center justify-center gap-1 ${
            filterPeriod === 'dinner'
              ? 'bg-brand-brown text-white shadow-brand-sm'
              : 'text-brand-mocha hover:text-brand-brown'
          }`}
        >
          <Moon className="w-3.5 h-3.5" /> Dinner
        </button>
      </div>

      {/* Slots Grid */}
      <ScrollArea className="h-[280px] pr-2">
        <motion.div
          className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-1"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: { staggerChildren: 0.04 },
            },
          }}
        >
          <AnimatePresence mode="popLayout">
            {filteredSlots.map((slot) => {
              const isSelected = time === slot.time;
              return (
                <motion.div
                  key={slot.time}
                  variants={{
                    hidden: { opacity: 0, scale: 0.95 },
                    visible: { opacity: 1, scale: 1 },
                  }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <button
                    type="button"
                    disabled={!slot.available}
                    onClick={() => {
                      setTime(slot.time);
                      onSelect();
                    }}
                    className={`w-full py-3 px-3 rounded-2xl font-bold text-sm flex flex-col items-center justify-center transition-all duration-200 border relative overflow-hidden ${
                      isSelected
                        ? 'bg-brand-red text-white border-brand-red shadow-brand-md ring-2 ring-brand-red/30'
                        : slot.available
                        ? 'bg-white text-brand-brown border-brand-brown/15 hover:bg-brand-tan/30 hover:border-brand-brown/30 shadow-sm'
                        : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      {slot.time}
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                    </span>
                    <span className={`text-[10px] font-medium mt-0.5 ${isSelected ? 'text-white/80' : 'text-brand-mocha'}`}>
                      90 min hold
                    </span>
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      </ScrollArea>
    </div>
  );
}
