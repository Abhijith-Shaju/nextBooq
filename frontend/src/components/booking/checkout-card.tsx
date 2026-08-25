'use client';

import { useEffect, useState } from 'react';
import { useBookingStore } from '@/store/use-booking-store';
import { openRazorpayCheckout } from '@/lib/razorpay';
import { useTenant } from '@/components/providers/tenant-provider';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { DEFAULT_TENANT_THEME } from '@/lib/theme/resolve-tenant-theme';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { CountdownTimer } from './countdown-timer';
import { LoadingFallback } from '@/components/shared/loading-fallback';
import { Lock, Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

interface RazorpayCheckoutResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

// A webhook confirming the same payment while this call is still in flight
// (or a brief network blip) is the common transient failure — the backend's
// verify-payment endpoint is idempotent (an already-CONFIRMED reservation
// short-circuits to success), so one short automatic retry before treating
// it as a real failure is always safe (L-03).
const VERIFY_RETRY_DELAY_MS = 2000;

export function CheckoutCard() {
  const { reservation, partySize, date, time } = useBookingStore();
  const { cafe } = useTenant();
  const router = useRouter();

  // The store's sessionStorage rehydration is asynchronous, so `reservation`
  // reads as null for a moment even when a real hold was persisted — wait
  // for hydration to actually finish before deciding there's nothing to
  // check out with (L-02).
  const [hasHydrated, setHasHydrated] = useState(useBookingStore.persist.hasHydrated());
  useEffect(() => {
    if (hasHydrated) return undefined;
    if (useBookingStore.persist.hasHydrated()) {
      setHasHydrated(true);
      return undefined;
    }
    return useBookingStore.persist.onFinishHydration(() => setHasHydrated(true));
  }, [hasHydrated]);

  useEffect(() => {
    // No live hold to check out with — a refresh with nothing persisted, an
    // expired sessionStorage entry, or a direct link straight to /checkout.
    // Previously this rendered em-dashes for date/time/party and a Pay
    // button that could never succeed; now it sends the guest back to start
    // a fresh booking instead.
    if (hasHydrated && !reservation) {
      router.replace(`/${cafe.slug}`);
    }
  }, [hasHydrated, reservation, cafe.slug, router]);

  // Set only if the automatic retry also fails -- holds the payment
  // reference so the guest (or the cafe, if contacted) has something
  // concrete to check, and drives the manual "Retry verification" UI (L-03).
  const [verifyFailure, setVerifyFailure] = useState<RazorpayCheckoutResponse | null>(null);
  const [isRetryingVerify, setIsRetryingVerify] = useState(false);

  if (!hasHydrated || !reservation) {
    return <LoadingFallback />;
  }

  // Authoritative: the exact rupee amount the Razorpay order was created
  // for (backend-derived from the cafe's reservation_fee setting), not a
  // client-side guess — Razorpay Checkout requires the amount it's opened
  // with to match the order it's paying, or the payment fails outright.
  // No fallback to cafe.reservation_rules.reservation_fee needed here
  // anymore — the guard above guarantees `reservation` (and so `.amount`)
  // is set before this line ever runs.
  const depositAmount = reservation.amount;
  const depositAmountLabel = Number.isInteger(depositAmount) ? String(depositAmount) : depositAmount.toFixed(2);

  const attemptVerify = async (response: RazorpayCheckoutResponse) => {
    await axiosInstance.post(
      `/api/v1/cafes/${cafe.id}/reservations/${reservation.id}/verify-payment`,
      {
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      }
    );
  };

  const handleRazorpaySuccess = async (response: RazorpayCheckoutResponse) => {
    // The Razorpay `handler` firing only means the client-side widget
    // completed a flow — it is not proof of payment. Confirmation must
    // come from the backend, which re-verifies the signature server-side.
    try {
      await attemptVerify(response);
      setVerifyFailure(null);
      toast.success('Payment verified! Reservation confirmed.');
      router.push(`/${cafe.slug}/success`);
      return;
    } catch (firstError) {
      console.error(firstError);
    }

    // One automatic retry before surfacing failure -- a webhook confirming
    // the same payment while this call is still in flight, or a brief
    // network blip, is the common transient cause, and the endpoint is
    // idempotent so retrying is always safe.
    await new Promise((resolve) => setTimeout(resolve, VERIFY_RETRY_DELAY_MS));
    try {
      await attemptVerify(response);
      setVerifyFailure(null);
      toast.success('Payment verified! Reservation confirmed.');
      router.push(`/${cafe.slug}/success`);
    } catch (secondError) {
      console.error(secondError);
      setVerifyFailure(response);
      toast.error('We could not verify your payment. Please contact the cafe if you were charged.');
    }
  };

  const handlePay = async () => {
    if (!reservation?.razorpay_order_id) {
      toast.error('Your reservation hold is still loading. Please wait a moment and try again.');
      return;
    }

    try {
      await openRazorpayCheckout({
        key: cafe.payments?.razorpay_key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_mockkey',
        amount: Math.round(depositAmount * 100), // in paise
        currency: 'INR',
        name: cafe.name,
        description: 'Table Hold Security Deposit',
        order_id: reservation.razorpay_order_id,
        handler: async function (response) {
          await handleRazorpaySuccess(response);
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

  const handleManualRetry = async () => {
    if (!verifyFailure) return;
    setIsRetryingVerify(true);
    try {
      await attemptVerify(verifyFailure);
      setVerifyFailure(null);
      toast.success('Payment verified! Reservation confirmed.');
      router.push(`/${cafe.slug}/success`);
    } catch (error) {
      console.error(error);
      toast.error('Still could not verify your payment. Please contact the cafe if you were charged.');
    } finally {
      setIsRetryingVerify(false);
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
          ₹{depositAmountLabel}
          <span className="ml-1 font-sans text-xs font-normal text-brand-mochaMid">refundable</span>
        </span>
      </div>

      {verifyFailure ? (
        <div className="mx-5 mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
          <div className="flex items-start gap-2 text-red-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">We couldn&apos;t confirm your payment</p>
              <p className="mt-1 text-red-700">
                Payment reference: <span className="font-mono">{verifyFailure.razorpay_payment_id}</span>. If you
                were charged, save this reference and contact the cafe, or try verifying again below.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleManualRetry}
            disabled={isRetryingVerify}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-red-300 bg-white py-2 text-sm font-semibold text-red-700 disabled:opacity-60"
          >
            {isRetryingVerify ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Retry verification
          </button>
        </div>
      ) : (
        <div className="px-5 pb-5">
          <button
            onClick={handlePay}
            className="w-full cta-hero justify-center py-3.5 text-base font-bold shadow-brand-lg"
          >
            <Lock className="mr-1.5 h-4 w-4" /> Pay ₹{depositAmountLabel} &amp; confirm table
          </button>
          <p className="mt-3 text-center text-xs text-brand-mochaMid">
            Deposit is held by Razorpay and adjusted against your bill at the cafe.
          </p>
        </div>
      )}
    </div>
  );
}
