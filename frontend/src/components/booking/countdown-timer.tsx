'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBookingStore } from '@/store/use-booking-store';
import { useTenant } from '@/components/providers/tenant-provider';
import { formatCountdown, secondsUntil, isExpired } from '@/lib/booking/countdown';

const HOLD_RING_CIRCUMFERENCE = 2 * Math.PI * 20;

export function CountdownTimer() {
  const { holdExpiresAt, resetBooking } = useBookingStore();
  const { cafe } = useTenant();
  const totalHoldSeconds = (cafe.reservation_rules?.hold_duration_minutes ?? 10) * 60;
  const [secondsLeft, setSecondsLeft] = useState(() =>
    holdExpiresAt ? secondsUntil(holdExpiresAt, new Date()) : 0
  );
  const router = useRouter();

  useEffect(() => {
    if (!holdExpiresAt) return;

    const tick = () => {
      const now = new Date();
      setSecondsLeft(secondsUntil(holdExpiresAt, now));
      if (isExpired(holdExpiresAt, now)) {
        resetBooking();
        router.push('/');
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [holdExpiresAt, router, resetBooking]);

  if (!holdExpiresAt) return null;

  // Ring drains from full to empty over the cafe's configured hold window.
  const progress = Math.min(1, Math.max(0, secondsLeft / totalHoldSeconds));
  const dashOffset = HOLD_RING_CIRCUMFERENCE * (1 - progress);

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-11 w-11 shrink-0">
        <svg viewBox="0 0 48 48" className="h-11 w-11 -rotate-90">
          <circle cx="24" cy="24" r="20" fill="none" stroke="hsl(var(--rule))" strokeWidth="4" />
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke="var(--brand-accent)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={HOLD_RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-bold text-brand-brown tabular-nums">
          {formatCountdown(secondsLeft)}
        </span>
      </div>
      <div className="text-xs">
        <div className="font-bold text-brand-brown">Table held for you</div>
        <div className="text-brand-mocha">Confirm before the ring runs out</div>
      </div>
    </div>
  );
}
