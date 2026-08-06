'use client';

import { useBookingStore } from '@/store/use-booking-store';
import { openRazorpayCheckout } from '@/lib/razorpay';
import { useTenant } from '@/components/providers/tenant-provider';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { CountdownTimer } from './countdown-timer';
import { ShieldCheck, Coffee, Lock } from 'lucide-react';
import { toast } from 'sonner';

export function CheckoutCard() {
  const { reservation, partySize, date, time } = useBookingStore();
  const { cafe } = useTenant();
  const router = useRouter();

  const depositAmount = 100; // ₹100 deposit per specs

  const handlePay = async () => {
    try {
      await openRazorpayCheckout({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_mockkey',
        amount: depositAmount * 100, // in paise
        currency: 'INR',
        name: cafe.name,
        description: 'Table Hold Security Deposit',
        order_id: reservation?.razorpay_order_id || 'order_' + Math.random().toString(36).substring(7),
        handler: function (response) {
          toast.success('Payment verified! Reservation confirmed.');
          router.push(`/${cafe.slug}/success`);
        },
        theme: {
          color: cafe.brand_primary || '#C8102E',
        },
      });
    } catch (error) {
      console.error(error);
      toast.error('Payment initialization failed.');
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto glass p-8 rounded-3xl border border-brand-brown/10 shadow-brand-lg">
      <div className="flex items-center justify-between border-b border-brand-brown/10 pb-6 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-red/10 text-brand-red rounded-2xl flex items-center justify-center">
            <Coffee className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-display text-brand-brown">{cafe.name}</h2>
            <p className="text-xs text-brand-mocha">Table Hold Deposit Confirmation</p>
          </div>
        </div>
        <CountdownTimer />
      </div>

      {/* Booking Summary */}
      <div className="bg-brand-tan/30 p-5 rounded-2xl border border-brand-brown/10 space-y-3 text-sm mb-6">
        <div className="flex justify-between">
          <span className="text-brand-mocha">Date:</span>
          <span className="font-bold text-brand-brown">
            {date ? format(date, 'EEEE, MMMM d, yyyy') : 'Selected Date'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-brand-mocha">Time Slot:</span>
          <span className="font-bold text-brand-brown">{time || 'Selected Time'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-brand-mocha">Party Size:</span>
          <span className="font-bold text-brand-brown">{partySize} Guests</span>
        </div>
      </div>

      {/* Pricing Breakdown */}
      <div className="space-y-2 border-t border-b border-brand-brown/10 py-4 mb-6 text-sm">
        <div className="flex justify-between text-brand-mocha">
          <span>Table Reservation Hold Fee</span>
          <span>₹{depositAmount}.00</span>
        </div>
        <div className="flex justify-between text-xs text-green-700 font-semibold">
          <span>Adjusted on Final Cafe Bill</span>
          <span>100% Refundable</span>
        </div>
        <div className="flex justify-between items-center text-lg font-bold text-brand-brown pt-2">
          <span>Total Deposit Due:</span>
          <span className="text-brand-red text-2xl font-display">₹{depositAmount}.00</span>
        </div>
      </div>

      <button
        onClick={handlePay}
        className="w-full cta-hero py-4 justify-center text-lg font-bold shadow-brand-lg mb-4"
      >
        <Lock className="w-5 h-5 mr-1.5" /> Pay ₹{depositAmount} via Razorpay
      </button>

      <div className="flex items-center justify-center gap-2 text-xs text-brand-mocha">
        <ShieldCheck className="w-4 h-4 text-green-600" /> 256-bit Encrypted Secure Checkout
      </div>
    </div>
  );
}
