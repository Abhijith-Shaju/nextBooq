'use client';

import { useBookingStore } from '@/store/use-booking-store';
import { openRazorpayCheckout } from '@/lib/razorpay';
import { useTenant } from '@/components/providers/tenant-provider';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { DEFAULT_TENANT_THEME } from '@/lib/theme/resolve-tenant-theme';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { CountdownTimer } from './countdown-timer';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';

export function CheckoutCard() {
  const { reservation, partySize, date, time } = useBookingStore();
  const { cafe } = useTenant();
  const router = useRouter();

  const depositAmount = 100; // ₹100 deposit per specs

  const handlePay = async () => {
    if (!reservation?.razorpay_order_id) {
      toast.error('Your reservation hold is still loading. Please wait a moment and try again.');
      return;
    }

    try {
      await openRazorpayCheckout({
        key: cafe.payments?.razorpay_key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_mockkey',
        amount: depositAmount * 100, // in paise
        currency: 'INR',
        name: cafe.name,
        description: 'Table Hold Security Deposit',
        order_id: reservation.razorpay_order_id,
        handler: async function (response) {
          // The Razorpay `handler` firing only means the client-side widget
          // completed a flow — it is not proof of payment. Confirmation must
          // come from the backend, which re-verifies the signature server-side.
          try {
            await axiosInstance.post(
              `/api/v1/cafes/${cafe.id}/reservations/${reservation.id}/verify-payment`,
              {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }
            );
            toast.success('Payment verified! Reservation confirmed.');
            router.push(`/${cafe.slug}/success`);
          } catch (verifyError) {
            console.error(verifyError);
            toast.error('We could not verify your payment. Please contact the cafe if you were charged.');
          }
        },
        theme: {
          color: cafe.brand_primary || DEFAULT_TENANT_THEME.brandPrimary,
        },
      });
    } catch (error) {
      console.error(error);
      toast.error('Payment initialization failed.');
    }
  };

  return (
    <div className="ticket-card mx-auto w-full max-w-md">
      <div className="ticket-field grid grid-cols-3 gap-3 p-5">
        <div>
          <div className="k">Date</div>
          <div className="v mt-0.5 text-[15px]">{date ? format(date, 'EEE d MMM') : '—'}</div>
        </div>
        <div>
          <div className="k">Time</div>
          <div className="v mt-0.5 text-[15px]">{time || '—'}</div>
        </div>
        <div>
          <div className="k">Party</div>
          <div className="v mt-0.5 text-[15px]">{partySize} guests</div>
        </div>
      </div>

      <div className="ticket-perf" />

      <div className="flex items-center gap-3 px-5 pt-4">
        <CountdownTimer />
      </div>

      <div className="flex items-baseline justify-between border-t border-dashed border-brand-brown/15 px-5 py-4 mt-4">
        <span className="text-sm text-brand-mocha">Deposit to confirm</span>
        <span className="font-mono text-2xl font-bold text-brand-brown">
          ₹{depositAmount}
          <span className="ml-1 font-sans text-xs font-normal text-brand-mochaMid">refundable</span>
        </span>
      </div>

      <div className="px-5 pb-5">
        <button
          onClick={handlePay}
          className="w-full cta-hero justify-center py-3.5 text-base font-bold shadow-brand-lg"
        >
          <Lock className="mr-1.5 h-4 w-4" /> Pay ₹{depositAmount} &amp; confirm table
        </button>
        <p className="mt-3 text-center text-xs text-brand-mochaMid">
          Deposit is held by Razorpay and adjusted against your bill at the cafe.
        </p>
      </div>
    </div>
  );
}
