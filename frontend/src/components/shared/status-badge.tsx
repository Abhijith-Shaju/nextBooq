'use client';

import { describeReservationStatus, StatusTone } from '@/lib/booking/reservation-status';

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'tone-success',
  pending: 'tone-pending',
  critical: 'tone-critical',
  neutral: 'tone-neutral',
};

export function StatusBadge({ status }: { status: string }) {
  const { label, tone } = describeReservationStatus(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide ${TONE_CLASSES[tone]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
