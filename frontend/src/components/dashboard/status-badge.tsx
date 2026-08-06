'use client';

import { ReservationStatus } from '@/lib/types/models';

interface StatusBadgeProps {
  status: ReservationStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const getBadgeStyle = (status: ReservationStatus) => {
    switch (status) {
      case 'CONFIRMED':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'CHECKED_IN':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'SEATED':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'COMPLETED':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'CANCELLED':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'NO_SHOW':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'PENDING_PAYMENT':
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${getBadgeStyle(
        status
      )}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}
