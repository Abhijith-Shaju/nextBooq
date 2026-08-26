'use client';

import { useMemo, useState } from 'react';
import { useTenant } from '@/components/providers/tenant-provider';
import { useDashboardStore } from '@/store/use-dashboard-store';
import { useManifest } from '@/hooks/host/use-manifest';
import { useTables } from '@/hooks/admin/use-tables';
import { ManifestTable } from '@/components/dashboard/manifest-table';
import { FloorplanCanvas } from '@/components/dashboard/floorplan-canvas';
import { ReservationDrawer } from '@/components/dashboard/reservation-drawer';
import { AssignTableModal } from '@/components/dashboard/assign-table-modal';
import { computeShiftMetrics } from '@/lib/dashboard/shift-metrics';
import { sortManifestReservations } from '@/lib/dashboard/manifest-order';
import { matchesReservationSearch } from '@/lib/dashboard/reservation-search';
import { Calendar as CalendarIcon, Users, CheckCircle2, Clock, Search } from 'lucide-react';

export default function HostStandDashboardPage() {
  const { cafe } = useTenant();
  const { selectedDate, setSelectedDate } = useDashboardStore();

  const { data: reservations = [], isLoading: isLoadingManifest } = useManifest(cafe?.id, selectedDate);
  const { data: tables = [] } = useTables(cafe?.id);
  const [searchTerm, setSearchTerm] = useState('');

  // Metrics describe the whole shift, so they stay on the unfiltered set —
  // narrowing the list to one guest shouldn't make the cover count drop.
  const { totalCovers, seatedCovers, expectedCovers } = computeShiftMetrics(reservations);

  // Only the manifest list is filtered. The floorplan, the drawer and the
  // assign modal keep the full set so a search can't hide a booked table or
  // strand the drawer on a reservation that just got filtered away.
  const visibleReservations = useMemo(
    () => sortManifestReservations(reservations).filter((r) => matchesReservationSearch(r, searchTerm)),
    [reservations, searchTerm]
  );

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white/70 backdrop-blur-sm p-5 rounded-2xl border border-brand-brown/10">
        <div>
          <h1 className="text-2xl font-bold font-display text-brand-brown">Host Stand</h1>
          <p className="text-xs text-brand-mochaMid mt-0.5">Live service &amp; table allocation</p>
        </div>

        {/* Date Selector & Metrics */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-xl border border-brand-brown/15">
            <CalendarIcon className="w-4 h-4 text-brand-red" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs font-mono font-bold text-brand-brown focus:outline-none bg-transparent tabular-nums"
            />
          </div>

          {/* Metrics Pills */}
          <div className="flex items-center gap-2 text-xs font-mono font-bold tabular-nums">
            <div className="tone-neutral px-3 py-2 rounded-xl flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              <span>{totalCovers} covers</span>
            </div>
            <div className="tone-success px-3 py-2 rounded-xl flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{seatedCovers} seated</span>
            </div>
            <div className="tone-pending px-3 py-2 rounded-xl flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>{expectedCovers} expected</span>
            </div>
          </div>
        </div>
      </div>

      {/* Split-Screen Main View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Panel: Manifest List (5 columns) */}
        <div className="lg:col-span-5 bg-white/70 backdrop-blur-sm rounded-2xl border border-brand-brown/10 overflow-hidden">
          <div className="p-4 border-b border-brand-brown/10 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-brand-brown text-sm font-display">Daily schedule</h3>
              <span className="text-xs font-mono text-brand-mochaMid tabular-nums">
                {searchTerm.trim()
                  ? `${visibleReservations.length} of ${reservations.length} bookings`
                  : `${reservations.length} bookings`}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-xl border border-brand-brown/15 text-xs">
              <Search className="w-4 h-4 text-brand-mochaMid" />
              <input
                type="text"
                placeholder="Search token, name, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="focus:outline-none bg-transparent w-full text-brand-brown"
              />
            </div>
          </div>
          <ManifestTable
            reservations={visibleReservations}
            isLoading={isLoadingManifest}
            isFiltered={searchTerm.trim().length > 0}
          />
        </div>

        {/* Right Panel: Floorplan Canvas (7 columns) */}
        <div className="lg:col-span-7">
          <FloorplanCanvas tables={tables} reservations={reservations} />
        </div>
      </div>

      {/* Slide-out Status Update Action Drawer */}
      <ReservationDrawer cafeId={cafe?.id} reservations={reservations} />

      {/* Assign an existing reservation to a table clicked on the floorplan */}
      <AssignTableModal cafeId={cafe?.id} tables={tables} reservations={reservations} />
    </div>
  );
}
