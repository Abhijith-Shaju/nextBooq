'use client';

import { useBookingStore } from '@/store/use-booking-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, CalendarPlus } from 'lucide-react';
import Link from 'next/link';
import { useTenant } from '@/components/providers/tenant-provider';
import { format } from 'date-fns';

export function SuccessCard() {
  const { date, time, partySize, resetBooking } = useBookingStore();
  const { cafe } = useTenant();

  return (
    <Card className="w-full max-w-md mx-auto shadow-xl text-center">
      <CardHeader>
        <div className="mx-auto w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <CardTitle className="text-2xl">Reservation Confirmed!</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-muted-foreground">
          We're looking forward to hosting you at <strong>{cafe.name}</strong>.
        </p>

        <div className="bg-muted p-4 rounded-lg space-y-2 text-sm text-left">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date:</span>
            <span className="font-medium">{date ? format(date, 'MMM do, yyyy') : 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Time:</span>
            <span className="font-medium">{time}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Party Size:</span>
            <span className="font-medium">{partySize} People</span>
          </div>
        </div>

        <div className="pt-4 flex flex-col gap-3">
          <Button variant="outline" className="w-full gap-2">
            <CalendarPlus className="w-4 h-4" /> Add to Calendar
          </Button>
          <Link href={`/${cafe.slug}`} onClick={() => resetBooking()} className="w-full">
            <Button variant="ghost" className="w-full">Book Another Table</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
