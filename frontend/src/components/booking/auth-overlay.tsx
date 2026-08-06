'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/components/providers/auth-provider';
import { useBookTable } from '@/hooks/public/use-book-table';
import { useBookingStore } from '@/store/use-booking-store';
import { useTenant } from '@/components/providers/tenant-provider';
import { format } from 'date-fns';
import { Loader2, ArrowRight, Calendar, User, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';

export function AuthOverlay({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { isAuthenticated, user } = useAuth();
  const { cafe } = useTenant();
  const { date, time, partySize } = useBookingStore();
  const bookTable = useBookTable(cafe?.id, cafe?.slug);

  const [guestName, setGuestName] = useState(user?.name || '');
  const [guestEmail, setGuestEmail] = useState(user?.email || '');
  const [guestPhone, setGuestPhone] = useState(user?.phone || '');

  const handleHoldReservation = () => {
    if (!date || !time) {
      toast.error('Please select date and time');
      return;
    }
    if (!isAuthenticated && (!guestName || !guestEmail || !guestPhone)) {
      toast.error('Please fill in your contact details');
      return;
    }

    // Format start_time as UTC ISO 8601 string
    const dateStr = format(date, 'yyyy-MM-dd');
    const isoDateTime = new Date(`${dateStr}T${time}:00`).toISOString();

    bookTable.mutate({
      start_time: isoDateTime,
      party_size: partySize,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px] p-6 rounded-3xl">
        <DialogHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-brand-red/10 text-brand-red rounded-2xl flex items-center justify-center mb-2">
            <Calendar className="w-6 h-6" />
          </div>
          <DialogTitle className="text-2xl font-bold font-display text-brand-brown">
            Confirm Guest Details
          </DialogTitle>
          <DialogDescription className="text-xs text-brand-mocha">
            Hold a table for {partySize} guest{partySize > 1 ? 's' : ''} at {cafe?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Reservation Summary Pill */}
          <div className="p-4 rounded-2xl bg-brand-tan/30 border border-brand-brown/10 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-brand-mocha">Date & Time:</span>
              <span className="font-bold text-brand-brown">
                {date ? format(date, 'EEE, MMM d, yyyy') : ''} @ {time}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-brand-mocha">Party Size:</span>
              <span className="font-bold text-brand-brown">{partySize} People</span>
            </div>
          </div>

          {!isAuthenticated && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold text-brand-brown">Full Name *</Label>
                <div className="relative mt-1">
                  <User className="w-4 h-4 text-brand-mocha absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    placeholder="Jane Doe"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="pl-9 text-sm"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-brand-brown">Email Address *</Label>
                <div className="relative mt-1">
                  <Mail className="w-4 h-4 text-brand-mocha absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    type="email"
                    placeholder="jane@example.com"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    className="pl-9 text-sm"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-brand-brown">Phone Number *</Label>
                <div className="relative mt-1">
                  <Phone className="w-4 h-4 text-brand-mocha absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    className="pl-9 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          <Button
            onClick={handleHoldReservation}
            disabled={bookTable.isPending}
            className="w-full cta-hero py-3.5 justify-center mt-4 text-base font-bold shadow-brand-md"
          >
            {bookTable.isPending ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Holding Table...
              </>
            ) : (
              <>
                Proceed to Deposit & Payment <ArrowRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
