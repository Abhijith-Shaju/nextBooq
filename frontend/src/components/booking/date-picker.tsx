'use client';

import { useBookingStore } from '@/store/use-booking-store';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { CalendarIcon } from 'lucide-react';

export function DatePicker() {
  const { date, setDate } = useBookingStore();

  return (
    <div className="space-y-3">
      <Label className="text-sm font-semibold flex items-center gap-2">
        <CalendarIcon className="w-4 h-4 text-brandPrimary" />
        Select Date
      </Label>
      <div className="border rounded-xl p-2 bg-background flex justify-center">
        <Calendar
          mode="single"
          selected={date || undefined}
          onSelect={(day) => day && setDate(day)}
          disabled={(date) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return date < today;
          }}
          className="rounded-md"
        />
      </div>
    </div>
  );
}
