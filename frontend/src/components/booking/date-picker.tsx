'use client';

import { useState, useEffect } from 'react';
import { useBookingStore } from '@/store/use-booking-store';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { CalendarIcon, Sparkles } from 'lucide-react';
import { addDays, isSameDay, format, isSaturday, isSunday, nextSaturday } from 'date-fns';
import { motion } from 'framer-motion';

export function DatePicker() {
  const { date, setDate } = useBookingStore();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = addDays(today, 1);

  // Compute upcoming weekend date
  const weekendDate = isSaturday(today) || isSunday(today) ? today : nextSaturday(today);

  const presets = [
    { label: 'Today', value: today },
    { label: 'Tomorrow', value: tomorrow },
    { label: 'This Weekend', value: weekendDate },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-bold text-brand-brown flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-brand-red" />
          Dining Date
        </Label>
        {isMounted && date && (
          <span className="text-xs font-bold text-brand-red bg-brand-red/10 px-2.5 py-0.5 rounded-full" suppressHydrationWarning>
            {format(date, 'EEE, MMM d')}
          </span>
        )}
      </div>

      {/* Date Presets */}
      <div className="flex items-center gap-2">
        {presets.map((preset) => {
          const isSelected = date && isSameDay(date, preset.value);
          return (
            <motion.button
              key={preset.label}
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setDate(preset.value)}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                isSelected
                  ? 'bg-brand-brown text-white border-brand-brown shadow-brand-sm'
                  : 'bg-white/80 text-brand-brown border-brand-brown/15 hover:bg-brand-tan/40'
              }`}
            >
              {preset.label}
            </motion.button>
          );
        })}
      </div>

      {/* Interactive Calendar Card */}
      <div className="border border-brand-brown/15 rounded-2xl p-2 bg-white/90 shadow-brand-sm flex justify-center">
        <Calendar
          mode="single"
          selected={date || undefined}
          onSelect={(day) => day && setDate(day)}
          disabled={(d) => {
            const current = new Date();
            current.setHours(0, 0, 0, 0);
            return d < current;
          }}
          className="rounded-md text-brand-brown font-sans"
        />
      </div>
    </div>
  );
}
