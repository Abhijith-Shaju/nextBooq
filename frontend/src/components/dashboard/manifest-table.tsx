'use client';

import { Reservation } from '@/lib/types/models';
import { StatusBadge } from '@/components/shared/status-badge';
import { useDashboardStore } from '@/store/use-dashboard-store';
import { Users, Clock, Hash, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface ManifestTableProps {
  reservations: Reservation[];
  isLoading?: boolean;
}

export function ManifestTable({ reservations, isLoading }: ManifestTableProps) {
  const { selectedReservationId, openDrawer } = useDashboardStore();

  if (isLoading) {
    return (
      <div className="space-y-2.5 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-brand-brown/5 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  if (!reservations || reservations.length === 0) {
    return (
      <div className="p-8 text-center text-brand-mochaMid flex flex-col items-center justify-center min-h-[300px]">
        <p className="text-sm">No reservations found for selected date.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3 overflow-y-auto max-h-[calc(100vh-220px)]">
      {reservations.map((res) => {
        const resId = res._id || res.id;
        const isSelected = selectedReservationId === resId;
        const timeFormatted = res.start_time ? format(parseISO(res.start_time), 'HH:mm') : 'N/A';

        return (
          <div
            key={resId}
            onClick={() => resId && openDrawer(resId)}
            className={`p-3.5 rounded-xl cursor-pointer transition-colors duration-150 border flex items-center justify-between ${
              isSelected
                ? 'bg-brand-tan/60 border-brand-red'
                : 'bg-white/60 border-brand-brown/10 hover:border-brand-mochaMid/40 hover:bg-brand-tan/20'
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-brand-brown text-sm">{res.guest_name || 'Guest'}</h4>
                <StatusBadge status={res.status} />
              </div>

              <div className="flex items-center gap-4 text-xs text-brand-mochaMid font-mono tabular-nums">
                <span className="flex items-center gap-1 font-semibold text-brand-brown">
                  <Clock className="w-3.5 h-3.5 text-brand-red" /> {timeFormatted}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" /> {res.party_size}
                </span>
                {res.table_number && (
                  <span className="flex items-center gap-1 font-semibold text-brand-brown">
                    <Hash className="w-3.5 h-3.5 text-brand-mochaMid" /> {res.table_number}
                  </span>
                )}
              </div>
            </div>

            <ChevronRight className="w-4 h-4 text-brand-mochaMid/60" />
          </div>
        );
      })}
    </div>
  );
}
