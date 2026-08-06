'use client';

import { useState } from 'react';
import { useTenant } from '@/components/providers/tenant-provider';
import { useManifest } from '@/hooks/host/use-manifest';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { Calendar, Search, Filter, Users, Hash, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function ReservationsHistoryPage() {
  const { cafe } = useTenant();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: reservations = [], isLoading } = useManifest(cafe?.id, selectedDate);

  const filteredReservations = reservations.filter((r) => {
    const matchesSearch =
      r.guest_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.guest_email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 glass p-6 rounded-3xl border border-brand-brown/10 shadow-brand-sm">
        <div>
          <h1 className="text-3xl font-extrabold font-display text-brand-brown">Reservations History</h1>
          <p className="text-xs text-brand-mocha mt-0.5">Filter and review all guest booking records</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3.5 py-2.5 rounded-2xl border border-brand-brown/20 text-xs">
            <Search className="w-4 h-4 text-brand-mocha" />
            <input
              type="text"
              placeholder="Search guest name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="focus:outline-none bg-transparent w-48 text-brand-brown"
            />
          </div>

          <div className="flex items-center gap-2 bg-white px-3.5 py-2.5 rounded-2xl border border-brand-brown/20 text-xs">
            <Calendar className="w-4 h-4 text-brand-red" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="focus:outline-none bg-transparent text-brand-brown font-bold"
            />
          </div>

          <div className="flex items-center gap-2 bg-white px-3.5 py-2.5 rounded-2xl border border-brand-brown/20 text-xs">
            <Filter className="w-4 h-4 text-brand-mocha" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="focus:outline-none bg-transparent text-brand-brown font-semibold"
            >
              <option value="all">All Statuses</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="CHECKED_IN">CHECKED IN</option>
              <option value="SEATED">SEATED</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CANCELLED">CANCELLED</option>
              <option value="NO_SHOW">NO SHOW</option>
            </select>
          </div>
        </div>
      </div>

      {/* Reservations Table */}
      <div className="glass rounded-3xl border border-brand-brown/10 shadow-brand-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-brand-brown">
            <thead className="bg-brand-tan/30 text-xs uppercase font-bold text-brand-mocha border-b border-brand-brown/10">
              <tr>
                <th className="p-4">Guest Info</th>
                <th className="p-4">Time</th>
                <th className="p-4">Party Size</th>
                <th className="p-4">Table</th>
                <th className="p-4">Status</th>
                <th className="p-4">OCC Token</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-brown/10">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-brand-mocha animate-pulse">
                    Loading reservation history...
                  </td>
                </tr>
              ) : filteredReservations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-brand-mocha">
                    No reservations matched your criteria.
                  </td>
                </tr>
              ) : (
                filteredReservations.map((res) => (
                  <tr key={res.id} className="hover:bg-brand-tan/20 transition-all">
                    <td className="p-4">
                      <div className="font-bold text-brand-brown">{res.guest_name}</div>
                      <div className="text-xs text-brand-mocha">{res.guest_email}</div>
                    </td>
                    <td className="p-4 font-semibold text-xs">
                      {res.start_time ? format(parseISO(res.start_time), 'HH:mm') : 'N/A'}
                    </td>
                    <td className="p-4 font-semibold text-xs">{res.party_size} Guests</td>
                    <td className="p-4 font-mono font-bold text-xs">
                      {res.table_number ? `T-${res.table_number}` : 'Unassigned'}
                    </td>
                    <td className="p-4">
                      <StatusBadge status={res.status} />
                    </td>
                    <td className="p-4 font-mono text-xs text-brand-mocha">__v: {res.__v}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
