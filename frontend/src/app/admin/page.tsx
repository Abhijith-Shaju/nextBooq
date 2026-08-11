'use client';

import { useState } from 'react';
import { useAdminOverview } from '@/hooks/admin/use-admin-overview';
import { useAdminOrgs } from '@/hooks/admin/use-admin-orgs';
import { CafeWithSubscription } from '@/lib/types/models';
import { format } from 'date-fns';
import { SubscriptionDrawer } from '@/components/admin/subscription-drawer';

const STAT_LABELS: { key: 'org_count' | 'cafe_count' | 'pending_count' | 'revenue'; label: string }[] = [
  { key: 'org_count', label: 'Organizations' },
  { key: 'cafe_count', label: 'Cafes' },
  { key: 'pending_count', label: 'Pending renewal' },
  { key: 'revenue', label: 'Revenue (₹/mo total contract value)' },
];

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-100 text-emerald-800';
    case 'trial':
      return 'bg-blue-100 text-blue-800';
    case 'past_due':
      return 'bg-amber-100 text-amber-800';
    case 'inactive':
      return 'bg-slate-200 text-slate-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

export default function AdminOverviewPage() {
  const { data: stats } = useAdminOverview();
  const { data: orgs = [] } = useAdminOrgs();
  const [selectedCafeId, setSelectedCafeId] = useState<string | null>(null);

  const handleSelectCafe = (cafeId: string) => setSelectedCafeId(cafeId);

  const selectedOrg = orgs.find((org) => org.cafes.some((cafe) => cafe._id === selectedCafeId));

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {STAT_LABELS.map(({ key, label }) => (
          <div key={key} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold">{stats ? stats[key] : '—'}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Cafe</th>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Term</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Renews / expires</th>
            </tr>
          </thead>
          <tbody>
            {orgs.flatMap((org) =>
              org.cafes.map((cafe: CafeWithSubscription) => (
                <tr
                  key={cafe._id}
                  role="row"
                  aria-selected={selectedCafeId === cafe._id}
                  onClick={() => handleSelectCafe(cafe._id)}
                  aria-label={cafe.name}
                  className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${
                    selectedCafeId === cafe._id ? 'bg-slate-100' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-medium">{cafe.name}</td>
                  <td className="px-4 py-3 text-slate-600">{org.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {cafe.subscription ? `${cafe.subscription.term_months} mo @ ₹${cafe.subscription.price_per_month}/mo` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {cafe.subscription ? (
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(cafe.subscription.status)}`}>
                        {cafe.subscription.status}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
                        Unconfigured
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {cafe.subscription
                      ? format(new Date(cafe.subscription.current_period_end), 'MMM d, yyyy')
                      : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <SubscriptionDrawer
        cafeId={selectedCafeId}
        orgId={selectedOrg?._id}
        onClose={() => setSelectedCafeId(null)}
      />
    </div>
  );
}
