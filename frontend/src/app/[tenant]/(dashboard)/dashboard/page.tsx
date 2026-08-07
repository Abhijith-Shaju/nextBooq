'use client';

import { useTenant } from '@/components/providers/tenant-provider';
import { useDashboardStore } from '@/store/use-dashboard-store';
import { useManifest } from '@/hooks/host/use-manifest';
import { useTables } from '@/hooks/admin/use-tables';
import { ManifestTable } from '@/components/dashboard/manifest-table';
import { FloorplanCanvas } from '@/components/dashboard/floorplan-canvas';
import { ReservationDrawer } from '@/components/dashboard/reservation-drawer';
import { Calendar as CalendarIcon, Users, CheckCircle2, Clock } from 'lucide-react';

export default function HostStandDashboardPage() {
  const { cafe } = useTenant();
  const { selectedDate, setSelectedDate } = useDashboardStore();

  const { data: reservations = [], isLoading: isLoadingManifest } = useManifest(cafe?.id, selectedDate);
  const { data: tables = [] } = useTables(cafe?.id);

  // Shift Metrics Calculations
  const totalCovers = reservations.reduce((acc, r) => acc + (r.party_size || 0), 0);
  const seatedCovers = reservations
    .filter((r) => r.status === 'SEATED')
    .reduce((acc, r) => acc + (r.party_size || 0), 0);
  const expectedCovers = reservations
    .filter((r) => r.status === 'CONFIRMED' || r.status === 'CHECKED_IN')
    .reduce((acc, r) => acc + (r.party_size || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 glass p-6 rounded-3xl border border-brand-brown/10 shadow-brand-sm">
        <div>
          <h1 className="text-3xl font-extrabold font-display text-brand-brown">Host Stand Manifest</h1>
          <p className="text-xs text-brand-mocha mt-0.5">Live Service & Table Allocation Control</p>
        </div>

        {/* Date Selector & Metrics */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-2xl border border-brand-brown/20 shadow-xs">
            <CalendarIcon className="w-4 h-4 text-brand-red" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs font-bold text-brand-brown focus:outline-none bg-transparent"
            />
          </div>

          {/* Metrics Pills */}
          <div className="flex items-center gap-3 text-xs font-bold">
            <div className="px-3.5 py-2 rounded-2xl bg-brand-tan/40 border border-brand-brown/10 text-brand-brown flex items-center gap-1.5">
              <Users className="w-4 h-4 text-brand-mocha" />
              <span>Total Covers: {totalCovers}</span>
            </div>
            <div className="px-3.5 py-2 rounded-2xl bg-emerald-100 border border-emerald-200 text-emerald-900 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Seated: {seatedCovers}</span>
            </div>
            <div className="px-3.5 py-2 rounded-2xl bg-amber-100 border border-amber-200 text-amber-900 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>Expected: {expectedCovers}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Split-Screen Main View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Panel: Manifest List (5 columns) */}
        <div className="lg:col-span-5 glass rounded-3xl border border-brand-brown/10 shadow-brand-md overflow-hidden">
          <div className="p-4 border-b border-brand-brown/10 bg-brand-tan/20 flex items-center justify-between">
            <h3 className="font-bold text-brand-brown text-base font-display">Daily Schedule</h3>
            <span className="text-xs font-mono text-brand-mocha">{reservations.length} Bookings</span>
          </div>
          <ManifestTable reservations={reservations} isLoading={isLoadingManifest} />
        </div>

        {/* Right Panel: Floorplan Canvas (7 columns) */}
        <div className="lg:col-span-7">
          <FloorplanCanvas tables={tables} reservations={reservations} />
        </div>
      </div>

      {/* Slide-out Status Update Action Drawer */}
      <ReservationDrawer cafeId={cafe?.id} reservations={reservations} />
    </div>
  );
}
