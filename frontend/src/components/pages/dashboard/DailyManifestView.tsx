'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Reservation, ReservationStatus } from '@/types';
import { ClipboardList, UserCheck, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { formatTime } from '@/lib/timezone';

const initialReservations: Reservation[] = [
  {
    _id: 'res-101',
    cafe_id: 'cafe-centralperk',
    user_id: 'usr-1',
    table_ids: ['t-2'],
    start_time: '2026-08-04T18:30:00Z',
    end_time: '2026-08-04T20:00:00Z',
    party_size: 4,
    reservation_timezone: 'Asia/Kolkata',
    status: 'CONFIRMED',
    customer_name: 'Chandler Bing',
    customer_phone: '+91 98765 11111',
    __v: 1,
    created_at: '2026-08-04T10:00:00Z',
    updated_at: '2026-08-04T10:00:00Z',
  },
  {
    _id: 'res-102',
    cafe_id: 'cafe-centralperk',
    user_id: 'usr-2',
    table_ids: ['t-4'],
    start_time: '2026-08-04T19:00:00Z',
    end_time: '2026-08-04T20:30:00Z',
    party_size: 6,
    reservation_timezone: 'Asia/Kolkata',
    status: 'SEATED',
    customer_name: 'Monica Geller',
    customer_phone: '+91 98765 22222',
    __v: 1,
    created_at: '2026-08-04T11:00:00Z',
    updated_at: '2026-08-04T11:00:00Z',
  },
  {
    _id: 'res-103',
    cafe_id: 'cafe-centralperk',
    user_id: 'usr-3',
    table_ids: ['t-1'],
    start_time: '2026-08-04T20:00:00Z',
    end_time: '2026-08-04T21:30:00Z',
    party_size: 2,
    reservation_timezone: 'Asia/Kolkata',
    status: 'HOLD',
    customer_name: 'Joey Tribbiani',
    customer_phone: '+91 98765 33333',
    __v: 1,
    created_at: '2026-08-04T12:00:00Z',
    updated_at: '2026-08-04T12:00:00Z',
  },
];

export function DailyManifestView() {
  const [reservations, setReservations] = useState<Reservation[]>(initialReservations);
  const [filter, setFilter] = useState<string>('ALL');

  const updateStatus = (resId: string, nextStatus: ReservationStatus) => {
    // Optimistic OCC update
    setReservations((prev) =>
      prev.map((r) => (r._id === resId ? { ...r, status: nextStatus, __v: r.__v + 1 } : r))
    );
  };

  const filteredReservations = filter === 'ALL'
    ? reservations
    : reservations.filter((r) => r.status === filter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Daily Shift Manifest</h1>
          <p className="text-xs text-stone-400">Live guest log updated automatically via Socket.io.</p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-stone-900 border border-stone-800 p-1 rounded-xl text-xs">
          {['ALL', 'CONFIRMED', 'SEATED', 'HOLD', 'COMPLETED'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                filter === f ? 'bg-amber-500 text-stone-950 shadow-sm' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Manifest Table */}
      <Card className="bg-stone-900/80 border-stone-800">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-stone-300">
              <thead className="text-xs uppercase bg-stone-950 text-stone-400 border-b border-stone-800">
                <tr>
                  <th className="p-4">Guest Name & Phone</th>
                  <th className="p-4">Time Slot</th>
                  <th className="p-4">Party</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Host Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800/60">
                {filteredReservations.map((res) => (
                  <tr key={res._id} className="hover:bg-stone-800/30">
                    <td className="p-4 font-semibold text-stone-100">
                      {res.customer_name}
                      <span className="block text-xs font-normal text-stone-500">{res.customer_phone}</span>
                    </td>
                    <td className="p-4 font-medium text-stone-200">
                      {formatTime(res.start_time)}
                    </td>
                    <td className="p-4 font-bold text-amber-400">{res.party_size} Guests</td>
                    <td className="p-4">
                      <Badge status={res.status} />
                    </td>
                    <td className="p-4 text-right space-x-2">
                      {res.status === 'CONFIRMED' && (
                        <Button size="sm" variant="secondary" onClick={() => updateStatus(res._id, 'SEATED')}>
                          <UserCheck className="w-3.5 h-3.5" /> Seat Guest
                        </Button>
                      )}
                      {res.status === 'SEATED' && (
                        <Button size="sm" variant="primary" onClick={() => updateStatus(res._id, 'COMPLETED')}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                        </Button>
                      )}
                      {res.status === 'HOLD' && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus(res._id, 'CONFIRMED')}>
                          Confirm Payment
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
