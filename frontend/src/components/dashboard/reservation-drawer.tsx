'use client';

import { useState } from 'react';
import { useDashboardStore } from '@/store/use-dashboard-store';
import { useUpdateStatus } from '@/hooks/host/use-update-status';
import { useModalDismiss } from '@/hooks/use-modal-dismiss';
import { Reservation, ReservationStatus } from '@/lib/types/models';
import { StatusBadge } from '@/components/shared/status-badge';
import { toast } from 'sonner';
import { SeatingConflictDialog, SeatingConflict } from '@/components/dashboard/seating-conflict-dialog';
import { getReservationTableNumbers } from '@/lib/dashboard/reservation-tables';
import { getReservationGuestName, getReservationGuestEmail, getReservationGuestPhone } from '@/lib/dashboard/reservation-guest';
import { X, User, Phone, Mail, Clock, Hash, CheckCircle, UserCheck, LogOut, XCircle, AlertCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface ReservationDrawerProps {
  cafeId: string | undefined;
  reservations: Reservation[];
}

export function ReservationDrawer({ cafeId, reservations }: ReservationDrawerProps) {
  const { isDrawerOpen, selectedReservationId, closeDrawer } = useDashboardStore();
  const updateStatusMutation = useUpdateStatus(cafeId);
  const { onBackdropClick } = useModalDismiss(isDrawerOpen, closeDrawer);
  const [occupancyConflict, setOccupancyConflict] = useState<SeatingConflict | null>(null);

  const res = reservations.find((r) => r._id === selectedReservationId || r.id === selectedReservationId);

  if (!isDrawerOpen || !res) return null;

  const resId = res._id || res.id;

  const handleStatusChange = (
    newStatus: ReservationStatus,
    options: { force?: boolean; reassign?: boolean } = {}
  ) => {
    if (!resId) return;
    updateStatusMutation.mutate(
      {
        reservationId: resId,
        status: newStatus,
        version: res.__v || 0, // OCC version token
        force: options.force ?? false,
        reassign: options.reassign ?? false,
      },
      {
        onSuccess: () => {
          setOccupancyConflict(null);
          closeDrawer();
        },
        onError: (error: any) => {
          const conflict = error?.response?.data?.conflict;
          if (error?.response?.status === 409 && error?.response?.data?.error?.code === 'TABLE_OCCUPIED' && conflict) {
            const alternate = error.response.data.alternate;
            // The host confirmed a move to a specific table and the backend
            // came back with nothing — say so, otherwise the Reassign button
            // silently disappearing reads as a glitch.
            if (options.reassign && !alternate) {
              toast.error('That table was just taken — no free table is available right now.');
            }
            setOccupancyConflict({
              guestName: conflict.guestName,
              tableNumbers: conflict.tableNumbers || [],
              alternate,
            });
          }
        },
      }
    );
  };

  const startFormatted = res.start_time ? format(parseISO(res.start_time), 'HH:mm') : 'N/A';
  const tableNumbers = getReservationTableNumbers(res).join(', ');

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end"
      onClick={onBackdropClick}
    >
      <div className="w-full max-w-md bg-white h-full shadow-2xl p-6 flex flex-col justify-between overflow-y-auto animate-fade-in border-l border-brand-brown/10">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-brand-brown/10">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold font-display text-brand-brown">Reservation Details</h3>
              <StatusBadge status={res.status} />
            </div>
            <button
              onClick={closeDrawer}
              className="p-2 rounded-full text-brand-mocha hover:bg-brand-tan/30 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Guest Info */}
          <div className="space-y-4 mb-8">
            <div className="p-4 rounded-2xl bg-brand-cream border border-brand-brown/10 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-red/10 text-brand-red rounded-xl flex items-center justify-center font-bold">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-brand-brown text-base">{getReservationGuestName(res)}</h4>
                  <p className="text-xs text-brand-mocha">Party of {res.party_size} Guests</p>
                </div>
              </div>

              <div className="pt-2 border-t border-brand-brown/10 space-y-1.5 text-xs text-brand-mocha">
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-brand-mocha" /> {getReservationGuestEmail(res) || 'N/A'}
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-brand-mocha" /> {getReservationGuestPhone(res) || 'N/A'}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-brand-red" /> {startFormatted}
                </div>
                {tableNumbers && (
                  <div className="flex items-center gap-2 font-mono font-bold text-brand-brown">
                    <Hash className="w-3.5 h-3.5" /> Assigned Table: T-{tableNumbers}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-brand-mocha mb-2">
              Lifecycle Action Controls
            </h4>

            {res.status !== 'CHECKED_IN' && res.status !== 'SEATED' && res.status !== 'COMPLETED' && (
              <button
                onClick={() => handleStatusChange('CHECKED_IN')}
                disabled={updateStatusMutation.isPending}
                className="btn-action w-full py-3 px-4 text-sm"
              >
                <UserCheck className="w-4 h-4" /> Check In Guest
              </button>
            )}

            {res.status !== 'SEATED' && res.status !== 'COMPLETED' && (
              <button
                onClick={() => handleStatusChange('SEATED')}
                disabled={updateStatusMutation.isPending}
                className="tone-success w-full py-3 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 hover:opacity-80 transition-opacity text-sm"
              >
                <CheckCircle className="w-4 h-4" /> Seat Guest at Table
              </button>
            )}

            {res.status === 'SEATED' && (
              <button
                onClick={() => handleStatusChange('COMPLETED')}
                disabled={updateStatusMutation.isPending}
                className="w-full py-3 px-4 rounded-xl font-semibold bg-brand-brown hover:bg-brand-brown/85 text-white flex items-center justify-center gap-2 transition-colors text-sm"
              >
                <LogOut className="w-4 h-4" /> Complete Dining (Clear Table)
              </button>
            )}

            {res.status !== 'CANCELLED' && res.status !== 'COMPLETED' && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => handleStatusChange('NO_SHOW')}
                  disabled={updateStatusMutation.isPending}
                  className="tone-neutral py-2.5 px-3 rounded-xl font-semibold hover:opacity-80 flex items-center justify-center gap-1.5 transition-opacity text-xs"
                >
                  <AlertCircle className="w-3.5 h-3.5" /> No-Show
                </button>
                <button
                  onClick={() => handleStatusChange('CANCELLED')}
                  disabled={updateStatusMutation.isPending}
                  className="tone-critical py-2.5 px-3 rounded-xl font-semibold hover:opacity-80 flex items-center justify-center gap-1.5 transition-opacity text-xs"
                >
                  <XCircle className="w-3.5 h-3.5" /> Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="pt-6 border-t border-brand-brown/10 text-center">
          <span className="text-[11px] font-mono text-brand-mochaMid tabular-nums">
            Version {res.__v} &middot; optimistic concurrency guard
          </span>
        </div>
      </div>

      <SeatingConflictDialog
        conflict={occupancyConflict}
        onOpenChange={(open) => !open && setOccupancyConflict(null)}
        onForceSeat={() => handleStatusChange('SEATED', { force: true })}
        onReassign={() => handleStatusChange('SEATED', { reassign: true })}
      />
    </div>
  );
}
