'use client';

import { useDashboardStore } from '@/store/use-dashboard-store';
import { useAssignTable } from '@/hooks/host/use-assign-table';
import { useModalDismiss } from '@/hooks/use-modal-dismiss';
import { Table, Reservation } from '@/lib/types/models';
import { StatusBadge } from '@/components/shared/status-badge';
import { getReservationGuestName } from '@/lib/dashboard/reservation-guest';
import { getReservationTableNumbers, isTableAssignedToReservation } from '@/lib/dashboard/reservation-tables';
import { X, Hash, Users, Clock, ArrowRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface AssignTableModalProps {
  cafeId: string | undefined;
  tables: Table[];
  reservations: Reservation[];
}

const ASSIGNABLE_STATUSES: Reservation['status'][] = ['CONFIRMED', 'CHECKED_IN', 'SEATED'];

export function AssignTableModal({ cafeId, tables, reservations }: AssignTableModalProps) {
  const { isAssignTableOpen, assignTableTargetId, closeAssignTable } = useDashboardStore();
  const assignTableMutation = useAssignTable(cafeId);
  const { onBackdropClick } = useModalDismiss(isAssignTableOpen, closeAssignTable);

  const table = tables.find((t) => (t.id || t._id) === assignTableTargetId);

  if (!isAssignTableOpen || !table) return null;

  const candidates = reservations.filter(
    (r) =>
      ASSIGNABLE_STATUSES.includes(r.status) &&
      r.party_size <= table.capacity &&
      !isTableAssignedToReservation(table, r)
  );

  const handleAssign = (reservation: Reservation) => {
    const resId = reservation._id || reservation.id;
    const tableId = table.id || table._id;
    if (!resId || !tableId) return;

    assignTableMutation.mutate(
      { reservationId: resId, tableId, version: reservation.__v || 0 },
      { onSuccess: () => closeAssignTable() }
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onBackdropClick}
    >
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-brand-lg p-6 border border-brand-brown/10 space-y-5 animate-scale-in max-h-[85vh] flex flex-col">
        <div className="border-b border-brand-brown/10 pb-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold font-display text-brand-brown flex items-center gap-1.5">
              <Hash className="w-4 h-4 opacity-60" /> Assign Table {table.table_number}
            </h3>
            <button
              onClick={closeAssignTable}
              className="p-2 rounded-full text-brand-mocha hover:bg-brand-tan/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="mt-1 text-xs text-brand-mocha">
            Pick a reservation to seat here — seats {table.capacity}, currently free.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 -mx-1 px-1">
          {candidates.length === 0 ? (
            <div className="p-6 text-center text-sm text-brand-mochaMid bg-brand-cream/60 rounded-2xl border border-dashed border-brand-brown/15">
              No reservations today fit this table right now.
            </div>
          ) : (
            candidates.map((reservation) => {
              const resId = reservation._id || reservation.id || '';
              const startFormatted = reservation.start_time ? format(parseISO(reservation.start_time), 'HH:mm') : 'N/A';
              const currentTableNumbers = getReservationTableNumbers(reservation).join(', ');

              return (
                <button
                  key={resId}
                  type="button"
                  onClick={() => handleAssign(reservation)}
                  disabled={assignTableMutation.isPending}
                  className="w-full flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-brand-brown/10 bg-white hover:bg-brand-tan/20 transition-colors text-left disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-brand-brown truncate">
                        {getReservationGuestName(reservation)}
                      </span>
                      <StatusBadge status={reservation.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-mono text-brand-mocha">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {startFormatted}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {reservation.party_size}
                      </span>
                      {currentTableNumbers && (
                        <span className="flex items-center gap-1">
                          <Hash className="w-3 h-3" /> currently T-{currentTableNumbers}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-brand-mocha shrink-0" />
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
