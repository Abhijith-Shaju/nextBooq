'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TenantPublicHeader } from '@/components/booking/tenant-header';
import { useCustomerReservations } from '@/hooks/customer/use-customer-reservations';
import { useAuth } from '@/components/providers/auth-provider';
import { useTenant } from '@/components/providers/tenant-provider';
import { CustomerAuthModal } from '@/components/auth/customer-auth-modal';
import { format } from 'date-fns';
import { Calendar, Clock, Users, ArrowLeft, Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export default function MyReservationsPage() {
  const { isAuthenticated } = useAuth();
  const { cafe } = useTenant();
  const { data: reservations = [], isLoading, refetch } = useCustomerReservations(isAuthenticated);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs px-2.5 py-1 rounded-full font-bold">Confirmed</span>;
      case 'HOLD':
      case 'PENDING_PAYMENT':
        return <span className="bg-amber-100 text-amber-800 border border-amber-300 text-xs px-2.5 py-1 rounded-full font-bold">Pending Payment</span>;
      case 'CANCELLED':
        return <span className="bg-rose-100 text-rose-800 border border-rose-300 text-xs px-2.5 py-1 rounded-full font-bold">Cancelled</span>;
      case 'SEATED':
      case 'CHECKED_IN':
        return <span className="bg-blue-100 text-blue-800 border border-blue-300 text-xs px-2.5 py-1 rounded-full font-bold">In Service</span>;
      case 'COMPLETED':
        return <span className="bg-slate-100 text-slate-700 border border-slate-300 text-xs px-2.5 py-1 rounded-full font-bold">Completed</span>;
      default:
        return <span className="bg-gray-100 text-gray-700 border border-gray-300 text-xs px-2.5 py-1 rounded-full font-bold">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-brand-cream flex flex-col font-sans">
      <TenantPublicHeader />

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href={`/${cafe.slug}`} className="inline-flex items-center text-xs font-semibold text-brand-mocha hover:text-brand-brown mb-2 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Storefront
            </Link>
            <h1 className="text-3xl font-extrabold font-display text-brand-brown">My Reservations</h1>
            <p className="text-xs text-brand-mocha mt-0.5">Manage your upcoming and past dining holds at {cafe.name}</p>
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
              href={`/${cafe.slug}`}
              className="cta-hero py-2.5 px-5 text-xs font-bold shadow-brand-sm inline-flex items-center gap-1.5"
            >
              Book a Table Now
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {reservations.map((res) => {
              const startDate = new Date(res.start_time);
              const resId = String(res._id || res.id || '');
              return (
                <div
                  key={resId}
                  className="glass rounded-3xl p-6 border border-brand-brown/10 shadow-brand-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all hover:border-brand-brown/20"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      {getStatusBadge(res.status)}
                      <span className="text-[11px] font-mono text-brand-mocha">Ref: #{resId.slice(-6)}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-brand-brown pt-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <Calendar className="w-4 h-4 text-brand-red" />
                        {format(startDate, 'EEE, MMM d, yyyy')}
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold text-brand-mocha">
                        <Clock className="w-4 h-4 text-brand-red" />
                        {format(startDate, 'h:mm a')}
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold text-brand-mocha">
                        <Users className="w-4 h-4 text-brand-red" />
                        {res.party_size} Guests
                      </div>
                    </div>
                  </div>

                  {res.status === 'PENDING_PAYMENT' && (
                    <Link
                      href={`/${cafe.slug}/checkout?reservationId=${resId}`}
                      className="cta-hero py-2.5 px-4 text-xs font-bold shadow-brand-sm whitespace-nowrap"
                    >
                      Complete Payment
                    </Link>
                  )}
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
