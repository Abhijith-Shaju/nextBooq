'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useOrgCafes } from '@/hooks/org/use-org-cafes';
import { useAssignStaff, AssignStaffPayload } from '@/hooks/org/use-assign-staff';
import { OrgCafe } from '@/lib/types/org';

const ROLE_OPTIONS: AssignStaffPayload['role'][] = ['owner', 'manager', 'host', 'staff'];

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

function AssignStaffForm({ cafeId, onDone }: { cafeId: string; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignStaffPayload['role']>('manager');
  const { mutate, isPending } = useAssignStaff(cafeId);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    mutate({ email, role });
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={`email-${cafeId}`} className="text-xs font-medium text-slate-600">Email</label>
        <input
          id={`email-${cafeId}`}
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`role-${cafeId}`} className="text-xs font-medium text-slate-600">Role</label>
        <select
          id={`role-${cafeId}`}
          value={role}
          onChange={(event) => setRole(event.target.value as AssignStaffPayload['role'])}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        Save
      </button>
    </form>
  );
}

function CafeCard({ cafe }: { cafe: OrgCafe }) {
  const [assigning, setAssigning] = useState(false);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href={`/${cafe.slug}/dashboard`} className="font-semibold text-slate-900 hover:underline">
            {cafe.name}
          </Link>
          <p className="mt-1 text-sm text-slate-600">Today&apos;s reservations: {cafe.today_reservation_count}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(cafe.subscription_status)}`}>
          {cafe.subscription_status}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setAssigning((prev) => !prev)}
        className="mt-3 text-sm font-medium text-slate-700 hover:underline"
      >
        Assign staff
      </button>
      {assigning && <AssignStaffForm cafeId={cafe._id} onDone={() => setAssigning(false)} />}
    </div>
  );
}

export default function OrgDashboardPage() {
  const { data: cafes = [] } = useOrgCafes();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Your cafes</h2>
        <p className="text-sm text-slate-600">All cafes under your organization.</p>
      </div>

      {cafes.length === 0 ? (
        <p className="text-sm text-slate-500">No cafes found for your organization yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cafes.map((cafe) => (
            <CafeCard key={cafe._id} cafe={cafe} />
          ))}
        </div>
      )}
    </div>
  );
}
