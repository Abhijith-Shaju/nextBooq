'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TenantPublicHeader } from '@/components/booking/tenant-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { useCustomerReservations } from '@/hooks/customer/use-customer-reservations';
import { useAuth } from '@/components/providers/auth-provider';
import { useTenant } from '@/components/providers/tenant-provider';
import { useBookingStore } from '@/store/use-booking-store';
import { CustomerAuthModal } from '@/components/auth/customer-auth-modal';
import { Reservation } from '@/lib/types/models';
import { format } from 'date-fns';
import { Calendar, Clock, Users, ArrowLeft, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

export default function MyReservationsPage() {
  const { isAuthenticated } = useAuth();
  const { cafe, tenantPath } = useTenant();
  const router = useRouter();
  const { data: reservations = [], isLoading, refetch } = useCustomerReservations(isAuthenticated);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const { setReservation, setPartySize, setDate, setTime, setHoldExpiresAt } = useBookingStore();

  // Checkout reads its data from the booking store, never from the URL (see
  // CheckoutCard) — so resuming an in-progress payment means hydrating that
  // store from the reservation we already fetched, the same way a fresh
  // booking hydrates it in use-book-table.ts. This is also what fixes the
  // reservation_id/reservationId param-name mismatch that broke this button:
  // there's no query param to name at all now.
  const resumePayment = (res: Reservation) => {
    const resId = String(res._id || res.id || '');
    const expiresAt = res.payment_data?.expires_at;

    setReservation({
      id: resId,
      status: res.status,
      razorpay_order_id: res.payment_data?.order_id || '',
      amount: res.payment_data?.amount || 0,
      currency: res.payment_data?.currency || 'INR',
      hold_expires_at: expiresAt || '',
    });
    setPartySize(res.party_size);
    setDate(new Date(res.start_time));
    setTime(format(new Date(res.start_time), 'HH:mm'));
    if (expiresAt) {
      setHoldExpiresAt(new Date(expiresAt));
    }

    router.push(tenantPath('/checkout'));
  };

  return (
    <div className="min-h-screen bg-brand-cream flex flex-col font-sans">
      <TenantPublicHeader />

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href={tenantPath('/')} className="inline-flex items-center text-xs font-semibold text-brand-mocha hover:text-brand-brown mb-2 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Storefront
            </Link>
            <h1 className="text-3xl font-bold font-display text-brand-brown">Your tokens</h1>
            <p className="text-xs text-brand-mocha mt-0.5">Every table you&rsquo;ve held or confirmed at {cafe.name}</p>
          </div>

          {isAuthenticated && (
            <button
              onClick={() => refetch()}
              className="p-2 rounded-xl bg-white border border-brand-brown/15 text-brand-brown hover:bg-brand-tan/30 transition-all text-xs font-semibold flex items-center gap-1.5 shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          )}
        </div>

        {!isAuthenticated ? (
          <div className="glass rounded-3xl p-8 text-center border border-brand-brown/10 shadow-brand-md space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-red/10 text-brand-red mx-auto flex items-center justify-center">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold font-display text-brand-brown">Sign in to view your bookings</h3>
              <p className="text-xs text-brand-mocha max-w-md mx-auto mt-1">
                Log in with your customer account or email to see active holds, confirmation status, and payment receipts.
              </p>
            </div>
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="cta-hero py-3 px-6 text-xs font-bold shadow-brand-md inline-flex items-center gap-2"
            >
              Sign In / Register Account
            </button>
          </div>
        ) : isLoading ? (
          <div className="glass rounded-3xl p-12 text-center border border-brand-brown/10 shadow-brand-sm">
            <Loader2 className="w-6 h-6 animate-spin text-brand-red mx-auto mb-2" />
            <p className="text-xs font-semibold text-brand-mocha">Fetching your reservations...</p>
          </div>
        ) : reservations.length === 0 ? (
          <div className="glass rounded-3xl p-8 text-center border border-brand-brown/10 shadow-brand-sm space-y-3">
            <div className="w-10 h-10 rounded-xl bg-brand-tan/50 text-brand-mocha mx-auto flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-base font-bold text-brand-brown">No reservations found</p>
              <p className="text-xs text-brand-mocha mt-0.5">You haven't held any tables at {cafe.name} yet.</p>
            </div>
            <Link
              href={tenantPath('/')}
              className="cta-hero py-2.5 px-5 text-xs font-bold shadow-brand-sm inline-flex items-center gap-1.5"
            >
              Book a Table Now
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {reservations.map((res) => {
              const startDate = new Date(res.start_time);
              const resId = String(res._id || res.id || '');
              const isPast = ['COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW', 'LEFT_BEFORE_SEATING'].includes(res.status);
              return (
                <div
                  key={resId}
                  className={`ticket-card flex items-stretch ${isPast ? 'opacity-60' : ''}`}
                >
                  <div className="flex w-16 shrink-0 flex-col items-center justify-center bg-brand-gold/15 text-brand-gold">
                    <span className="font-mono text-lg font-bold tabular-nums">#{resId.slice(-4)}</span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={res.status} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-brand-brown">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-brand-red" />
                          {format(startDate, 'EEE, MMM d')}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-brand-red" />
                          {format(startDate, 'h:mm a')}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-brand-red" />
                          {res.party_size} guests
                        </span>
                      </div>
                    </div>

                    {res.status === 'PENDING_PAYMENT' && (
                      <button
                        onClick={() => resumePayment(res)}
                        className="cta-hero shrink-0 whitespace-nowrap px-4 py-2.5 text-xs font-bold shadow-brand-sm"
                      >
                        Complete Payment
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <CustomerAuthModal open={isAuthModalOpen} onOpenChange={setIsAuthModalOpen} />
    </div>
  );
}
