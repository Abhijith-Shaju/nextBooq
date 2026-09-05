'use client';

import { useState } from 'react';
import { useTenant } from '@/components/providers/tenant-provider';
import { useManifest } from '@/hooks/host/use-manifest';
import { StatusBadge } from '@/components/shared/status-badge';
import { getReservationTableNumbers } from '@/lib/dashboard/reservation-tables';
import {
  getReservationGuestName,
  getReservationGuestEmail,
  getReservationGuestPhone,
} from '@/lib/dashboard/reservation-guest';
import { getReservationToken } from '@/lib/booking/reservation-token';
import { matchesReservationSearch } from '@/lib/dashboard/reservation-search';
import { Calendar, Search, Filter, Users, Hash, Clock, IndianRupee } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { hasCafePermission } from '@/lib/dashboard/tenant-membership';
import { FlagRefundDialog } from '@/components/dashboard/flag-refund-dialog';
import { Reservation } from '@/lib/types/models';
import { format, parseISO } from 'date-fns';

export default function ReservationsHistoryPage() {
  const { cafe } = useTenant();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [flagging, setFlagging] = useState<Reservation | null>(null);
  const { user } = useAuth();

  // Deciding the cafe owes money is the same class of decision as asserting it
  // has been paid, so this matches the settle permission rather than the
  // read-the-queue one.
  const canFlagRefund = hasCafePermission(user, cafe?.id, 'manage_billing');

  // Only a booking whose fee was actually captured can be refunded, and one
  // already on the queue must not be added twice -- the API refuses both, but
  // offering the action anyway would just be a button that always errors.
  const isFlaggable = (res: Reservation) =>
    Boolean(res.payment_data?.payment_id) && !res.payment_data?.requires_manual_refund;

  const { data: reservations = [], isLoading, isError } = useManifest(cafe?.id, selectedDate);

  const filteredReservations = reservations.filter((r) => {
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesReservationSearch(r, searchTerm) && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white/70 backdrop-blur-sm p-5 rounded-2xl border border-brand-brown/10">
        <div>
          <h1 className="text-2xl font-bold font-display text-brand-brown">Reservations History</h1>
          <p className="text-xs text-brand-mochaMid mt-0.5">Filter and review all guest booking records</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-xl border border-brand-brown/15 text-xs">
            <Search className="w-4 h-4 text-brand-mochaMid" />
            <input
              type="text"
              placeholder="Search token, name, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="focus:outline-none bg-transparent w-48 text-brand-brown"
            />
          </div>

          <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-xl border border-brand-brown/15 text-xs">
            <Calendar className="w-4 h-4 text-brand-red" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="focus:outline-none bg-transparent text-brand-brown font-mono font-bold tabular-nums"
            />
          </div>

          <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-xl border border-brand-brown/15 text-xs">
            <Filter className="w-4 h-4 text-brand-mochaMid" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="focus:outline-none bg-transparent text-brand-brown font-semibold"
            >
              <option value="all">All statuses</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="CHECKED_IN">Checked in</option>
              <option value="SEATED">Seated</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="NO_SHOW">No-show</option>
            </select>
          </div>
        </div>
      </div>

      {/* Reservations Table */}
      <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-brand-brown/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-brand-brown">
            <thead className="bg-brand-tan/30 text-xs uppercase font-bold text-brand-mochaMid border-b border-brand-brown/10">
              <tr>
                <th className="p-4">Token</th>
                <th className="p-4">Guest</th>
                <th className="p-4">Time</th>
                <th className="p-4">Party</th>
                <th className="p-4">Table</th>
                <th className="p-4">Status</th>
                <th className="p-4">Version</th>
                {canFlagRefund ? <th className="p-4 sr-only">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-brown/10">
              {isLoading ? (
                <tr>
                  <td colSpan={canFlagRefund ? 8 : 7} className="p-8 text-center text-brand-mochaMid animate-pulse">
                    Loading reservation history...
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={canFlagRefund ? 8 : 7} className="p-8 text-center text-brand-redDark font-semibold">
                    Couldn&rsquo;t load reservations. Please try refreshing the page.
                  </td>
                </tr>
              ) : filteredReservations.length === 0 ? (
                <tr>
                  <td colSpan={canFlagRefund ? 8 : 7} className="p-8 text-center text-brand-mochaMid">
                    No reservations matched your criteria.
                  </td>
                </tr>
              ) : (
                filteredReservations.map((res, idx) => {
                  const resKey = String(res._id || res.id || `res_${idx}`);
                  const tableNumbers = getReservationTableNumbers(res).join(', ');
                  return (
                    <tr key={resKey} className="hover:bg-brand-tan/20 transition-colors">
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-brand-brown tabular-nums">
                          <Hash className="w-3 h-3 text-brand-red" />
                          {getReservationToken(res)}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-brand-brown">{getReservationGuestName(res)}</div>
                        <div className="text-xs text-brand-mochaMid">{getReservationGuestEmail(res) || 'N/A'}</div>
                        {getReservationGuestPhone(res) && (
                          <div className="text-xs text-brand-mochaMid font-mono tabular-nums">
                            {getReservationGuestPhone(res)}
                          </div>
                        )}
                      </td>
                      <td className="p-4 font-mono font-semibold text-xs tabular-nums">
                        {res.start_time ? format(parseISO(res.start_time), 'HH:mm') : 'N/A'}
                      </td>
                      <td className="p-4 font-mono font-semibold text-xs tabular-nums">{res.party_size}</td>
                      <td className="p-4 font-mono font-bold text-xs tabular-nums">
                        {tableNumbers || 'Unassigned'}
                      </td>
                      <td className="p-4">
                        <StatusBadge status={res.status} />
                      </td>
                      <td className="p-4 font-mono text-xs text-brand-mochaMid tabular-nums">{res.__v ?? 0}</td>
                      {canFlagRefund ? (
                        <td className="p-4 text-right">
                          {res.payment_data?.requires_manual_refund ? (
                            <span className="text-[11px] font-semibold text-amber-800 whitespace-nowrap">
                              Refund owed
                            </span>
                          ) : isFlaggable(res) ? (
                            <button
                              type="button"
                              onClick={() => setFlagging(res)}
                              className="tone-neutral py-1.5 px-2.5 rounded-lg text-[11px] font-semibold hover:opacity-80 whitespace-nowrap inline-flex items-center gap-1"
                            >
                              <IndianRupee className="w-3 h-3" /> Flag refund
                            </button>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {flagging ? (
        <FlagRefundDialog
          reservation={flagging}
          cafeId={cafe?.id}
          onClose={() => setFlagging(null)}
        />
      ) : null}
    </div>
  );
}
