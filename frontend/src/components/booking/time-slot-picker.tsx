'use client';

import { useBookingStore } from '@/store/use-booking-store';
import { useAvailability } from '@/hooks/public/use-availability';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';

export function TimeSlotPicker({ onSelect }: { onSelect: () => void }) {
  const { cafe, date, partySize, time, setTime } = useBookingStore();
  const { data: slots, isLoading } = useAvailability(cafe?.id, date, partySize);

  if (!date) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground border-2 border-dashed rounded-xl p-4 text-center">
        <Clock className="w-8 h-8 mb-2 opacity-50" />
        <p>Select a date and party size to see available times.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-10 bg-muted animate-pulse rounded-md" />
        ))}
      </div>
    );
  }

  if (!slots || slots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground bg-muted/50 rounded-xl p-4 text-center">
        <p>No availability on this date.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[300px] pr-4">
      <motion.div 
        className="grid grid-cols-3 gap-3"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: { staggerChildren: 0.05 }
          }
        }}
      >
        {slots.map((slot) => {
          const isSelected = time === slot.time;
          return (
            <motion.div
              key={slot.time}
              variants={{
                hidden: { opacity: 0, y: 10 },
                visible: { opacity: 1, y: 0 }
              }}
            >
              <Button
                variant={isSelected ? 'default' : 'outline'}
                disabled={!slot.available}
                onClick={() => {
                  setTime(slot.time);
                  onSelect();
                }}
                className={`w-full ${isSelected ? 'bg-brandPrimary text-brandPrimary-foreground hover:bg-brandPrimary/90' : ''}`}
              >
                {slot.time}
              </Button>
            </motion.div>
          );
        })}
      </motion.div>
    </ScrollArea>
  );
}
