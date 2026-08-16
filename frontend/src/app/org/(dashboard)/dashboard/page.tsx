'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Coffee, Loader2, Plus, Users } from 'lucide-react';
import { useOrgCafes } from '@/hooks/org/use-org-cafes';
import { useAssignStaff, AssignStaffPayload } from '@/hooks/org/use-assign-staff';
import { OrgCafe } from '@/lib/types/org';
import { Skeleton } from '@/components/ui/skeleton';

const ROLE_OPTIONS: AssignStaffPayload['role'][] = ['owner', 'manager', 'host', 'staff'];

const STATUS_STYLES: Record<string, string> = {
  active: 'border-emerald-200 bg-emerald-100 text-emerald-800',
  trial: 'border-blue-200 bg-blue-100 text-blue-800',
  past_due: 'border-amber-200 bg-amber-100 text-amber-800',
  inactive: 'border-brand-tan bg-brand-tan/60 text-brand-mocha',
};

function statusStyle(status: string): string {
  return STATUS_STYLES[status] ?? 'border-brand-tan bg-brand-tan/60 text-brand-mocha';
}

function AssignStaffForm({ cafeId, onDone }: { cafeId: string; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignStaffPayload['role']>('manager');
  const { mutate, isPending, isSuccess } = useAssignStaff(cafeId);

  useEffect(() => {
    if (isSuccess) onDone();
  }, [isSuccess, onDone]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    mutate({ email, role });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-3 rounded-2xl border border-brand-brown/10 bg-brand-tan/20 p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor={`email-${cafeId}`} className="mb-1 block text-xs font-semibold text-brand-mocha">
            Email
          </label>
          <input
            id={`email-${cafeId}`}
            type="email"
            required
            placeholder="manager@cafe.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-brand-brown/20 bg-white/90 px-3 py-2 text-sm focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/30"
          />
        </div>
        <div>
          <label htmlFor={`role-${cafeId}`} className="mb-1 block text-xs font-semibold text-brand-mocha">
            Role
          </label>
          <select
            id={`role-${cafeId}`}
            value={role}
            onChange={(event) => setRole(event.target.value as AssignStaffPayload['role'])}
            className="w-full rounded-lg border border-brand-brown/20 bg-white/90 px-3 py-2 text-sm focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/30 sm:w-36"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-red px-4 py-2 text-sm font-semibold text-white shadow-brand-sm transition-colors hover:bg-brand-redDark disabled:opacity-50"
      >
        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Save
      </button>
    </form>
  );
}

function CafeCard({ cafe }: { cafe: OrgCafe }) {
  const [assigning, setAssigning] = useState(false);

  return (
    <div className="rounded-2xl border border-brand-brown/10 bg-white/80 p-5 shadow-brand-sm transition-shadow hover:shadow-brand-md">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/${cafe.slug}/dashboard`} className="group/link inline-flex items-start gap-1">
          <span className="font-display text-lg font-bold leading-snug text-brand-brown">{cafe.name}</span>
          <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-brand-mocha opacity-0 transition-opacity group-hover/link:opacity-100" />
        </Link>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusStyle(cafe.subscription_status)}`}
        >
          {cafe.subscription_status}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-sm text-brand-mocha">
        <Users className="h-4 w-4" />
        <span>
          <span className="font-semibold text-brand-brown">{cafe.today_reservation_count}</span>{' '}
          reservation{cafe.today_reservation_count === 1 ? '' : 's'} today
        </span>
      </div>

      <button
        type="button"
        onClick={() => setAssigning((prev) => !prev)}
        className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-red hover:underline"
      >
        <Plus className="h-3.5 w-3.5" />
        Assign staff
      </button>

      {assigning && <AssignStaffForm cafeId={cafe._id} onDone={() => setAssigning(false)} />}
    </div>
  );
}

function CafeCardSkeleton() {
  return (
    <div className="rounded-2xl border border-brand-brown/10 bg-white/80 p-5">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="mt-4 h-4 w-1/2" />
      <Skeleton className="mt-5 h-4 w-24" />
    </div>
  );
}

export default function OrgDashboardPage() {
  const { data: cafes = [], isLoading, isError } = useOrgCafes();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-2xl font-bold text-brand-brown">Your cafes</h2>
        <p className="mt-1 text-sm text-brand-mocha">All cafes under your organization, at a glance.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <CafeCardSkeleton />
          <CafeCardSkeleton />
          <CafeCardSkeleton />
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm font-medium text-red-700">Couldn&apos;t load your cafes. Please try again.</p>
        </div>
      ) : cafes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-brown/20 bg-white/50 p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-tan/50">
            <Coffee className="h-5 w-5 text-brand-mocha" />
          </div>
          <p className="mt-4 text-sm font-semibold text-brand-brown">No cafes found for your organization yet.</p>
          <p className="mt-1 text-sm text-brand-mocha">Once cafes are added to your organization, they&apos;ll show up here.</p>
        </div>
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
