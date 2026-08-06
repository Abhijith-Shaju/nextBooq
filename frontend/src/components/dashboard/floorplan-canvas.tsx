'use client';

import { Table, Reservation } from '@/lib/types/models';
import { Users, Hash } from 'lucide-react';
import { useDashboardStore } from '@/store/use-dashboard-store';

interface FloorplanCanvasProps {
  tables: Table[];
  reservations: Reservation[];
}

export function FloorplanCanvas({ tables, reservations }: FloorplanCanvasProps) {
  const { openDrawer } = useDashboardStore();

  // Helper function to calculate table occupancy status color
  const getTableStatusColor = (table: Table) => {
    if (table.status === 'out_of_service') {
      return 'bg-gray-200 border-gray-400 text-gray-500 opacity-60';
    }

    // Find reservation assigned to this table
    const assignedRes = reservations.find(
      (r) => r.table_number === table.table_number && r.status !== 'CANCELLED' && r.status !== 'COMPLETED'
    );

    if (!assignedRes) {
      return 'bg-emerald-50 border-emerald-500 text-emerald-900 hover:bg-emerald-100 shadow-sm'; // Green (Empty)
    }

    if (assignedRes.status === 'SEATED') {
      return 'bg-rose-50 border-rose-500 text-rose-900 hover:bg-rose-100 shadow-md ring-2 ring-rose-400'; // Red (Seated)
    }

    return 'bg-amber-50 border-amber-500 text-amber-900 hover:bg-amber-100 shadow-sm'; // Yellow (Reserved soon)
  };

  if (!tables || tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-brand-mocha border-2 border-dashed border-brand-brown/10 rounded-3xl p-8 text-center glass">
        <p className="text-sm font-semibold">No physical floorplan layout configured.</p>
        <p className="text-xs text-brand-mocha mt-1">Go to Tables Inventory to add your physical cafe tables.</p>
      </div>
    );
  }

  return (
    <div className="p-6 glass rounded-3xl border border-brand-brown/10 min-h-[500px]">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-brand-brown/10">
        <h3 className="font-bold text-brand-brown text-lg font-display">Floorplan Layout</h3>
        <div className="flex items-center gap-4 text-xs font-semibold">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> Available (Green)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> Reserved Soon (Yellow)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" /> Seated (Red)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
        {tables.map((table) => {
          const assignedRes = reservations.find(
            (r) => r.table_number === table.table_number && r.status !== 'CANCELLED' && r.status !== 'COMPLETED'
          );

          return (
            <div
              key={table.id || table.table_number}
              onClick={() => {
                if (assignedRes) {
                  openDrawer(assignedRes.id);
                }
              }}
              className={`p-5 rounded-3xl border-2 transition-all duration-200 cursor-pointer flex flex-col justify-between h-36 ${getTableStatusColor(
                table
              )}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-extrabold text-lg flex items-center gap-1">
                  <Hash className="w-4 h-4 opacity-70" /> T-{table.table_number}
                </span>
                <span className="text-xs font-bold flex items-center gap-1 opacity-80">
                  <Users className="w-3.5 h-3.5" /> {table.capacity}p
                </span>
              </div>

              <div>
                {assignedRes ? (
                  <div className="truncate space-y-0.5">
                    <p className="font-bold text-xs truncate">{assignedRes.guest_name}</p>
                    <p className="text-[10px] font-semibold opacity-80 uppercase tracking-wider">
                      {assignedRes.status}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs font-medium opacity-60">Empty</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
