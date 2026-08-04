'use client';

import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ShieldCheck, ShieldAlert, Store, ToggleLeft, ToggleRight, DollarSign, Activity, Settings } from 'lucide-react';
import { Cafe, AccountStatus } from '@/types';

// Mock platform cafe dataset for super admin view
const initialCafes: Cafe[] = [
  {
    _id: 'cafe-1',
    org_id: 'org-1',
    name: 'Central Perk Cafe',
    slug: 'centralperk',
    timezone: 'Asia/Kolkata',
    reservation_rules: { default_turn_time_minutes: 90, max_party_size: 12, booking_lead_time_hours: 24 },
    subscription_status: 'active',
    account_status: 'ACTIVE',
    mrr: 2999,
    reservation_count: 1420,
  },
  {
    _id: 'cafe-2',
    org_id: 'org-2',
    name: 'Coffee Cove',
    slug: 'coffeecove',
    timezone: 'Asia/Kolkata',
    reservation_rules: { default_turn_time_minutes: 60, max_party_size: 8, booking_lead_time_hours: 12 },
    subscription_status: 'active',
    account_status: 'ACTIVE',
    mrr: 5999,
    reservation_count: 2890,
  },
  {
    _id: 'cafe-3',
    org_id: 'org-3',
    name: 'The Grind Roastery',
    slug: 'thegrind',
    timezone: 'Asia/Kolkata',
    reservation_rules: { default_turn_time_minutes: 90, max_party_size: 10, booking_lead_time_hours: 24 },
    subscription_status: 'past_due',
    account_status: 'SUSPENDED',
    mrr: 2999,
    reservation_count: 310,
  },
];

export function AdminDashboardView() {
  const { user, isPlatformAdmin } = useAuth();

  const [cafes, setCafes] = useState<Cafe[]>(initialCafes);
  const [isMarketplaceEnabled, setIsMarketplaceEnabled] = useState(false);

  const toggleAccountStatus = (cafeId: string) => {
    setCafes((prev) =>
      prev.map((c) => {
        if (c._id === cafeId) {
          const nextStatus: AccountStatus = c.account_status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
          return { ...c, account_status: nextStatus };
        }
        return c;
      })
    );
  };

  const totalMRR = cafes.reduce((acc, c) => acc + (c.mrr || 0), 0);
  const totalReservations = cafes.reduce((acc, c) => acc + (c.reservation_count || 0), 0);

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 p-6 md:p-10 max-w-7xl mx-auto space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-stone-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" /> Internal Super-Admin Control Plane
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight mt-1">Platform Operations & Tenant Control</h1>
        </div>
        <Badge variant="warning" className="text-xs py-1 px-3">
          Role: SUPER_ADMIN ({user?.email || 'admin@nextbooq.com'})
        </Badge>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card className="bg-stone-900/60 border-stone-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-stone-400">Total Monthly Recurring Revenue</CardTitle>
            <DollarSign className="w-5 h-5 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-emerald-400">₹{totalMRR.toLocaleString('en-IN')}</div>
            <p className="text-xs text-stone-500 mt-1">From {cafes.length} active cafe organizations</p>
          </CardContent>
        </Card>

        <Card className="bg-stone-900/60 border-stone-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-stone-400">Platform Reservation Volume</CardTitle>
            <Activity className="w-5 h-5 text-indigo-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-indigo-400">{totalReservations.toLocaleString()}</div>
            <p className="text-xs text-stone-500 mt-1">Total reservations processed across network</p>
          </CardContent>
        </Card>

        <Card className="bg-stone-900/60 border-stone-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-stone-400">Consumer Marketplace (Phase 2)</CardTitle>
            <Settings className="w-5 h-5 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm font-semibold text-stone-200">
                {isMarketplaceEnabled ? 'ENABLED' : 'DISABLED (Phase 2)'}
              </span>
              <button onClick={() => setIsMarketplaceEnabled(!isMarketplaceEnabled)} className="text-amber-400">
                {isMarketplaceEnabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8 text-stone-600" />}
              </button>
            </div>
            <p className="text-xs text-stone-500 mt-2">Global database feature flag toggle</p>
          </CardContent>
        </Card>
      </div>

      {/* Tenant Management Table with Account Kill Switch */}
      <Card className="bg-stone-900/60 border-stone-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Store className="w-5 h-5 text-amber-400" /> Tenant Management & Account Kill Switch
          </CardTitle>
          <CardDescription>
            Separates subscription status from account status. Toggling account_status to SUSPENDED instantly disables tenant public booking pages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-stone-300">
              <thead className="text-xs uppercase bg-stone-950 text-stone-400 border-b border-stone-800">
                <tr>
                  <th className="p-4">Cafe Name & Slug</th>
                  <th className="p-4">Subscription Status</th>
                  <th className="p-4">Account Status</th>
                  <th className="p-4">MRR</th>
                  <th className="p-4">Reservations</th>
                  <th className="p-4 text-right">Kill Switch Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800/60">
                {cafes.map((cafe) => (
                  <tr key={cafe._id} className="hover:bg-stone-800/30">
                    <td className="p-4 font-semibold text-stone-100">
                      {cafe.name}
                      <span className="block text-xs font-normal text-stone-500">{cafe.slug}.nextbooq.com</span>
                    </td>
                    <td className="p-4">
                      <Badge status={cafe.subscription_status.toUpperCase()} />
                    </td>
                    <td className="p-4">
                      <Badge status={cafe.account_status} />
                    </td>
                    <td className="p-4 font-medium text-emerald-400">₹{cafe.mrr}</td>
                    <td className="p-4">{cafe.reservation_count}</td>
                    <td className="p-4 text-right">
                      <Button
                        size="sm"
                        variant={cafe.account_status === 'ACTIVE' ? 'danger' : 'secondary'}
                        onClick={() => toggleAccountStatus(cafe._id)}
                      >
                        {cafe.account_status === 'ACTIVE' ? (
                          <>
                            <ShieldAlert className="w-3.5 h-3.5" /> Suspend Tenant
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5" /> Reinstate Tenant
                          </>
                        )}
                      </Button>
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
