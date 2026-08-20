'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/components/providers/auth-provider';
import { useBookTable } from '@/hooks/public/use-book-table';
import { useCustomerQuickAuth } from '@/hooks/auth/use-customer-quick-auth';
import { useBookingStore } from '@/store/use-booking-store';
import { useTenant } from '@/components/providers/tenant-provider';
import { format } from 'date-fns';
import { Loader2, ArrowRight, Calendar, User, Mail, Phone, Lock, CheckCircle2, Shield, MailWarning } from 'lucide-react';
import { toast } from 'sonner';

export function AuthOverlay({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { isAuthenticated, user } = useAuth();
  const { cafe } = useTenant();
  const { date, time, partySize } = useBookingStore();
  const bookTable = useBookTable(cafe?.id, cafe?.slug);
  const quickAuth = useCustomerQuickAuth();
  const holdDurationMinutes = cafe?.reservation_rules?.hold_duration_minutes ?? 10;

  const [guestName, setGuestName] = useState(user?.name || '');
  const [guestEmail, setGuestEmail] = useState(user?.email || '');
  const [guestPhone, setGuestPhone] = useState(user?.phone || '');
  const [guestPassword, setGuestPassword] = useState('');
  const [specialNotes, setSpecialNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validation helpers
  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const isValidPhone = (p: string) => p.replace(/\D/g, '').length >= 7;

  const handleHoldReservation = async () => {
    if (!date || !time) {
      toast.error('Please select a date and time slot first');
      return;
    }

    if (!isAuthenticated) {
      if (!guestName.trim()) {
        toast.error('Please enter your full name');
        return;
      }
      if (!isValidEmail(guestEmail)) {
        toast.error('Please enter a valid email address');
        return;
      }
      if (!isValidPhone(guestPhone)) {
        toast.error('Please enter a valid contact phone number');
        return;
      }
      if (guestPassword.trim().length < 8) {
        toast.error('Please enter a password of at least 8 characters');
        return;
      }
    }

    const dateStr = format(date, 'yyyy-MM-dd');
    const isoDateTime = new Date(`${dateStr}T${time}:00`).toISOString();

    // Block if email is not verified — the backend will reject anyway, but
    // we surface a clear message before wasting a round-trip.
    if (isAuthenticated && !user?.is_email_verified) {
      toast.error('Please verify your email address before booking a table.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (!isAuthenticated) {
        // Authenticate / Register Customer user account seamlessly
        await quickAuth.mutateAsync({
          name: guestName.trim(),
          email: guestEmail.trim(),
          phone: guestPhone.trim(),
          password: guestPassword.trim(),
        });
      }

      // Proceed to create hold reservation
      bookTable.mutate(
        {
          start_time: isoDateTime,
          party_size: partySize,
        },
        {
          onSettled: () => {
            setIsSubmitting(false);
          },
        }
      );
    } catch {
      // The axios interceptor already toasts the specific error (invalid
      // password, server error, etc.) — this just resets the button state.
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-0 rounded-3xl border-0 shadow-brand-md bg-white overflow-hidden">
        <DialogHeader className="text-center space-y-1.5 px-6 pt-6">
          <div className="mx-auto w-12 h-12 bg-brand-red/10 text-brand-red rounded-2xl flex items-center justify-center mb-1 shadow-brand-sm">
            <Calendar className="w-6 h-6" />
          </div>
          <DialogTitle className="text-2xl font-bold font-display text-brand-brown">
            Hold this table
          </DialogTitle>
          <DialogDescription className="text-xs text-brand-mocha">
            {time} &middot; {partySize} {partySize === 1 ? 'guest' : 'guests'} &middot; {cafe?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-6 pt-2">
          {/* Reservation Summary Pill */}
          <div className="ticket-field grid grid-cols-3 gap-3 rounded-2xl bg-brand-tan/40 p-4">
            <div>
              <div className="k">Date</div>
              <div className="v mt-0.5 text-[13px]">{date ? format(date, 'EEE d MMM') : ''}</div>
            </div>
            <div>
              <div className="k">Time</div>
              <div className="v mt-0.5 text-[13px]">{time}</div>
            </div>
            <div>
              <div className="k">Hold</div>
              <div className="v mt-0.5 text-[13px] text-brand-gold">{holdDurationMinutes} min</div>
            </div>
          </div>

          {/* Form Fields */}
          {isAuthenticated && !user?.is_email_verified ? (
            /* Unverified user — block the hold and prompt to verify. */
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <MailWarning className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-900">
                    Email verification required
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Please verify <span className="font-semibold">{user?.email}</span> before
                    holding a table. It only takes 30 seconds.
                  </p>
                </div>
              </div>
              <a
                href={`/auth/verify-email?callbackUrl=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/')}`}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 transition-colors px-4 py-2.5 text-sm font-bold text-white shadow-sm"
              >
                <MailWarning className="w-4 h-4" /> Verify my email
              </a>
            </div>
          ) : isAuthenticated ? (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                  {user?.name?.charAt(0).toUpperCase() || 'G'}
                </div>
                <div>
                  <p className="font-bold text-emerald-950 flex items-center gap-1">
                    {user?.name} <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  </p>
                  <p className="text-emerald-700 text-[11px]">{user?.email}</p>
                </div>
              </div>
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-1 rounded-lg">
                Verified Guest
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-bold text-brand-brown flex items-center justify-between">
                  <span>Full Name <span className="text-brand-red">*</span></span>
                </Label>
                <div className="relative mt-1">
                  <User className="w-4 h-4 text-brand-mocha absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <Input
                    placeholder="Jane Doe"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="pl-10 h-11 text-sm rounded-xl border-brand-brown/20 focus:border-brand-red focus:ring-brand-red/20"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold text-brand-brown flex items-center justify-between">
                  <span>Email Address <span className="text-brand-red">*</span></span>
                  {guestEmail && (
                    <span className={`text-[10px] ${isValidEmail(guestEmail) ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {isValidEmail(guestEmail) ? '✓ Valid email' : 'Invalid email'}
                    </span>
                  )}
                </Label>
                <div className="relative mt-1">
                  <Mail className="w-4 h-4 text-brand-mocha absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <Input
                    type="email"
                    placeholder="jane@example.com"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    className="pl-10 h-11 text-sm rounded-xl border-brand-brown/20 focus:border-brand-red focus:ring-brand-red/20"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold text-brand-brown flex items-center justify-between">
                  <span>Phone Number <span className="text-brand-red">*</span></span>
                  {guestPhone && (
                    <span className={`text-[10px] ${isValidPhone(guestPhone) ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {isValidPhone(guestPhone) ? '✓ Valid phone' : 'Enter number'}
                    </span>
                  )}
                </Label>
                <div className="relative mt-1">
                  <Phone className="w-4 h-4 text-brand-mocha absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <Input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    className="pl-10 h-11 text-sm rounded-xl border-brand-brown/20 focus:border-brand-red focus:ring-brand-red/20"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-brand-brown flex items-center justify-between">
                  <span>Password <span className="text-brand-red">*</span></span>
                  <span className="text-[10px] text-brand-mocha">At least 8 characters</span>
                </Label>
                <div className="relative mt-1">
                  <Lock className="w-4 h-4 text-brand-mocha absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <Input
                    type="password"
                    placeholder="Choose a password for your account"
                    value={guestPassword}
                    onChange={(e) => setGuestPassword(e.target.value)}
                    className="pl-10 h-11 text-sm rounded-xl border-brand-brown/20 focus:border-brand-red focus:ring-brand-red/20"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Submit Action Button */}
          <Button
            onClick={handleHoldReservation}
            disabled={
              isSubmitting ||
              bookTable.isPending ||
              quickAuth.isPending ||
              (isAuthenticated && !user?.is_email_verified)
            }
            className="w-full cta-hero py-4 justify-center mt-2 text-base font-bold shadow-brand-md rounded-2xl"
          >
            {isSubmitting || bookTable.isPending || quickAuth.isPending ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Holding your table...
              </>
            ) : (
              <>
                Proceed to payment <ArrowRight className="w-4 h-4 ml-1.5" />
              </>
            )}
          </Button>

          <p className="text-[10px] text-center text-brand-mocha flex items-center justify-center gap-1">
            <Shield className="w-3 h-3 text-emerald-600" />
            100% Encrypted & Safe • No double bookings guaranteed
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
