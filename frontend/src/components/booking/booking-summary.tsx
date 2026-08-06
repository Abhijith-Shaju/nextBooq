'use client';

import { useBookingStore } from '@/store/use-booking-store';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';

export function BookingSummary() {
  const { partySize, date, time, cafe } = useBookingStore();

  return (
    <Card className="w-full">
      <CardContent className="p-4 space-y-2">
        <h3 className="font-semibold text-lg">{cafe?.name || 'Cafe'}</h3>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Date:</span>
          <span>{date ? format(date, 'MMM do, yyyy') : '-'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Time:</span>
          <span>{time || '-'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Party Size:</span>
          <span>{partySize} People</span>
        </div>
      </CardContent>
    </Card>
  );
}
