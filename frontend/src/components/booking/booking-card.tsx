'use client';

import { useBookingStore } from '@/store/use-booking-store';
import { PartySizeSelect } from './party-size-select';
import { DatePicker } from './date-picker';
import { TimeSlotPicker } from './time-slot-picker';
import { AuthOverlay } from './auth-overlay';
import { Card, CardContent } from '@/components/ui/card';
import { useState } from 'react';

export function BookingCard() {
  const { partySize, date, time } = useBookingStore();
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

  const handleTimeSelect = () => {
    // When time is selected, pop auth overlay
    setShowAuthOverlay(true);
  };

  return (
    <>
      <Card className="w-full max-w-4xl mx-auto shadow-2xl rounded-2xl overflow-hidden border-0 ring-1 ring-black/5 dark:ring-white/10 bg-card/95 backdrop-blur-sm">
        <CardContent className="p-8">
          <h2 className="text-2xl font-bold mb-8 text-center text-foreground">Find a Table</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-8">
              <PartySizeSelect />
              <DatePicker />
            </div>
            
            <div className="space-y-4">
              <h3 className="font-medium text-lg border-b pb-2">Available Slots</h3>
              <TimeSlotPicker onSelect={handleTimeSelect} />
            </div>
          </div>
        </CardContent>
      </Card>
      
      <AuthOverlay 
        open={showAuthOverlay} 
        onOpenChange={setShowAuthOverlay} 
      />
    </>
  );
}
