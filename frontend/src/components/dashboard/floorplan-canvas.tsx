'use client';

import { Table, Reservation } from '@/lib/types/models';
import { Users, Hash } from 'lucide-react';
import { useDashboardStore } from '@/store/use-dashboard-store';
import { resolveTableVisualState, TableTone } from '@/lib/dashboard/table-visual-state';
import { getReservationGuestName } from '@/lib/dashboard/reservation-guest';

interface FloorplanCanvasProps {
  tables: Table[];
  reservations: Reservation[];
}

const TONE_CLASSES: Record<TableTone, string> = {
  'out-of-service': 'bg-brand-tan/40 border-brand-brown/15 text-brand-mochaMid opacity-60',
  empty: 'bg-emerald-50 border-emerald-400 text-emerald-900 hover:bg-emerald-100',
  'reserved-soon': 'bg-brand-gold/10 border-brand-gold text-brand-brown hover:bg-brand-gold/20',
  seated: 'bg-brand-red/10 border-brand-red text-brand-brown hover:bg-brand-red/15 ring-2 ring-brand-red/25',
};

export function FloorplanCanvas({ tables, reservations }: FloorplanCanvasProps) {
  const { openDrawer } = useDashboardStore();

  if (!tables || tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-brand-mocha border-2 border-dashed border-brand-brown/10 rounded-2xl p-8 text-center bg-white/40">
        <p className="text-sm font-semibold">No physical floorplan layout configured.</p>
        <p className="text-xs text-brand-mochaMid mt-1">Go to Tables Inventory to add your physical cafe tables.</p>
      </div>
    );
  }

  return (
    <div className="p-5 bg-white/70 backdrop-blur-sm rounded-2xl border border-brand-brown/10 min-h-[500px]">
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-brand-brown/10">
        <h3 className="font-bold text-brand-brown text-sm font-display">Floorplan</h3>
        <div className="flex items-center gap-4 text-xs font-semibold text-brand-mocha">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Available
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-gold inline-block" /> Reserved soon
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-red inline-block" /> Seated
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {tables.map((table) => {
          const { tone, assignedReservation } = resolveTableVisualState(table, reservations);
          const resId = assignedReservation?._id || assignedReservation?.id;
          const Tag = resId ? 'button' : 'div';

          const content = (
            <>
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-sm flex items-center gap-1 tabular-nums">
                  <Hash className="w-3.5 h-3.5 opacity-60" /> {table.table_number}
                </span>
                <span className="text-xs font-bold flex items-center gap-1 opacity-70 tabular-nums">
                  <Users className="w-3.5 h-3.5" /> {table.capacity}
                </span>
              </div>

              <div>
                {assignedReservation ? (
                  <div className="truncate space-y-0.5">
                    <p className="font-bold text-xs truncate">{getReservationGuestName(assignedReservation)}</p>
                    <p className="text-[10px] font-semibold opacity-70 uppercase tracking-wide">
                      {assignedReservation.status}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs font-medium opacity-60">Empty</p>
                )}
              </div>
            </>
          );

          return (
            <Tag
              key={table.id || table.table_number}
              type={resId ? 'button' : undefined}
              onClick={resId ? () => openDrawer(resId) : undefined}
              className={`p-4 rounded-2xl border-2 transition-colors duration-150 flex flex-col justify-between h-32 text-left ${
                resId ? 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-red focus-visible:outline-offset-2' : ''
              } ${TONE_CLASSES[tone]}`}
            >
              {content}
            </Tag>
          );
        })}
      </div>
    </div>
  );
}
