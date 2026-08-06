'use client';

import { useEffect, useState } from 'react';
import { useBookingStore } from '@/store/use-booking-store';
import { Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function CountdownTimer() {
  const { holdExpiresAt, resetBooking } = useBookingStore();
  const [timeLeft, setTimeLeft] = useState(300); // 5 mins in seconds
  const router = useRouter();

  useEffect(() => {
    if (!holdExpiresAt) return;
    
    const interval = setInterval(() => {
      const now = new Date();
      const diff = Math.floor((holdExpiresAt.getTime() - now.getTime()) / 1000);
      
      if (diff <= 0) {
        clearInterval(interval);
        resetBooking();
        router.push('/');
      } else {
        setTimeLeft(diff);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [holdExpiresAt, router, resetBooking]);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;

  return (
    <div className="flex items-center gap-2 text-red-500 font-medium">
      <Clock className="w-4 h-4" />
      <span>{mins}:{secs < 10 ? '0' : ''}{secs}</span>
    </div>
  );
}
