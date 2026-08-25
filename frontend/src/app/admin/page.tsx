'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAdminOverview } from '@/hooks/admin/use-admin-overview';
import { useAdminOrgs } from '@/hooks/admin/use-admin-orgs';
import { useRefundsNeeded } from '@/hooks/admin/use-refunds-needed';
import { format, formatDistanceToNow } from 'date-fns';
import { SubscriptionDrawer } from '@/components/admin/subscription-drawer';
import {
  flattenCafeRows,
  filterCafeRows,
  sortCafeRows,
  SortField,
  SortDir,
} from '@/lib/admin/cafe-rows';

const STAT_LABELS: { key: 'org_count' | 'cafe_count' | 'pending_count' | 'revenue'; label: string }[] = [
  { key: 'org_count', label: 'Organizations' },
  { key: 'cafe_count', label: 'Cafes' },
  { key: 'pending_count', label: 'Pending renewal' },
  { key: 'revenue', label: 'Revenue (₹/mo total contract value)' },
];

const PAGE_SIZE = 10;

function countdownLabel(currentPeriodEnd: string): string {
  const isLapsed = new Date(currentPeriodEnd).getTime() <= Date.now();
  return isLapsed
    ? `Expired ${formatDistanceToNow(new Date(currentPeriodEnd))} ago`
    : `${formatDistanceToNow(new Date(currentPeriodEnd))} left`;
}

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
  const { data: refundsNeeded = [] } = useRefundsNeeded();
  const [selectedCafeId, setSelectedCafeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const searchParams = useSearchParams();
  const requestedCafeId = searchParams.get('cafeId');

  useEffect(() => {
    if (requestedCafeId && orgs.some((org) => org.cafes.some((cafe) => cafe._id === requestedCafeId))) {
      setSelectedCafeId(requestedCafeId);
    }
  }, [requestedCafeId, orgs]);

  const allRows = useMemo(() => flattenCafeRows(orgs), [orgs]);
  const filteredRows = useMemo(() => filterCafeRows(allRows, searchQuery), [allRows, searchQuery]);
  const sortedRows = useMemo(
    () => sortCafeRows(filteredRows, sortField, sortDir),
    [filteredRows, sortField, sortDir]
  );
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = sortedRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleSelectCafe = (cafeId: string) => setSelectedCafeId(cafeId);
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setPage(1);
  };
  const handleSortFieldChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortField(e.target.value as SortField);
    setPage(1);
  };
  const handleSortDirToggle = () => {
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    setPage(1);
  };

  const selectedRow = allRows.find((row) => row.cafe._id === selectedCafeId) || null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="text-2xl font-bold">Platform overview</h2><p className="text-sm text-slate-600">Organizations, cafes, and subscriptions.</p></div>
        <Link href="/admin/onboard-cafe" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Onboard Cafe</Link>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {STAT_LABELS.map(({ key, label }) => (
          <div key={key} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold">{stats ? stats[key] : '—'}</p>
          </div>
        ))}
      </div>

      {refundsNeeded.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            {refundsNeeded.length} payment{refundsNeeded.length === 1 ? '' : 's'} need
            {refundsNeeded.length === 1 ? 's' : ''} a manual refund
          </p>
          <p className="mt-0.5 text-xs text-amber-700">
            A payment succeeded after its reservation was already cancelled/expired — no
            automated refund exists yet, so these need to be refunded by hand in Razorpay.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {refundsNeeded.map((r) => {
              const cafeName = typeof r.cafe_id === 'string' ? r.cafe_id : r.cafe_id.name;
              const guestEmail = typeof r.user_id === 'string' ? r.user_id : r.user_id.email;
              return (
                <li key={r._id} className="flex flex-wrap items-baseline gap-x-2 text-amber-900">
                  <span className="font-mono text-xs">{r.payment_data.order_id || '—'}</span>
                  <span>₹{r.payment_data.amount}</span>
                  <span>·</span>
                  <span>{cafeName}</span>
                  <span>·</span>
                  <span>{guestEmail}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder="Search by cafe or organization name"
          aria-label="Search cafes"
          className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-64"
        />
        <select
          aria-label="Sort by"
          value={sortField}
          onChange={handleSortFieldChange}
          className="rounded-md border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="name">Name</option>
          <option value="date">Date added</option>
          <option value="remaining">Time remaining</option>
        </select>
        <button
          type="button"
          onClick={handleSortDirToggle}
          aria-label={sortDir === 'asc' ? 'Sort descending' : 'Sort ascending'}
          className="rounded-md border border-slate-300 px-2.5 py-2 text-sm font-semibold hover:bg-slate-50"
        >
          {sortDir === 'asc' ? '↑' : '↓'}
        </button>
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
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  {searchQuery.trim() ? 'No cafes match your search.' : 'No cafes yet.'}
                </td>
              </tr>
            ) : (
              pageRows.map(({ cafe, orgName }) => (
                <tr
                  key={cafe._id}
                  role="row"
                  tabIndex={0}
                  aria-selected={selectedCafeId === cafe._id}
                  onClick={() => handleSelectCafe(cafe._id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectCafe(cafe._id);
                    }
                  }}
                  aria-label={cafe.name}
                  className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-500 focus-visible:-outline-offset-2 ${
                    selectedCafeId === cafe._id ? 'bg-slate-100' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-medium">{cafe.name}</td>
                  <td className="px-4 py-3 text-slate-600">{orgName}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {cafe.subscription ? `${cafe.subscription.term_months} mo @ ₹${cafe.subscription.price_per_month}/mo` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {cafe.subscription ? (
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(cafe.subscription.status)}`}>
                        {cafe.subscription.status}
                      </span>
                    ) : (
                      <span
                        className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
                        title={`No subscription recorded — cafe's booking status is currently "${cafe.subscription_status}"`}
                      >
                        Unconfigured ({cafe.subscription_status})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {cafe.subscription ? (
                      <>
                        {format(new Date(cafe.subscription.current_period_end), 'MMM d, yyyy')}
                        <span className="ml-1.5 text-xs text-slate-400">
                          ({countdownLabel(cafe.subscription.current_period_end)})
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={safePage <= 1}
          className="rounded-md border border-slate-300 px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <span>Page {safePage} of {totalPages}</span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={safePage >= totalPages}
          className="rounded-md border border-slate-300 px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>

      <SubscriptionDrawer
        key={selectedCafeId}
        cafeId={selectedCafeId}
        orgId={selectedRow?.orgId}
        cafe={selectedRow?.cafe ?? null}
        onClose={() => setSelectedCafeId(null)}
      />
    </div>
  );
}
