'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Coffee, LayoutDashboard, Loader2, Plus, Trash2, UserCog, Users } from 'lucide-react';
import { useOrgCafes } from '@/hooks/org/use-org-cafes';
import { useCafeStaff } from '@/hooks/org/use-cafe-staff';
import { useAssignStaff, AssignStaffPayload } from '@/hooks/org/use-assign-staff';
import { useRemoveStaff } from '@/hooks/org/use-remove-staff';
import { useAuth } from '@/components/providers/auth-provider';
import { OrgCafe } from '@/lib/types/org';
import { Skeleton } from '@/components/ui/skeleton';

const ROLE_OPTIONS: AssignStaffPayload['role'][] = ['owner', 'manager', 'host', 'staff'];

const STATUS_STYLES: Record<string, string> = {
  active: 'border-emerald-200 bg-emerald-100 text-emerald-800',
  trial: 'border-blue-200 bg-blue-100 text-blue-800',
  past_due: 'border-amber-200 bg-amber-100 text-amber-800',
  inactive: 'border-brand-tan bg-brand-tan/60 text-brand-mocha',
};

const ROLE_BADGE_STYLES: Record<string, string> = {
  owner: 'border-brand-red/20 bg-brand-red/10 text-brand-red',
  manager: 'border-blue-200 bg-blue-100 text-blue-800',
  host: 'border-brand-tan bg-brand-tan/60 text-brand-mocha',
  staff: 'border-brand-tan bg-brand-tan/60 text-brand-mocha',
};

function statusStyle(status: string): string {
  return STATUS_STYLES[status] ?? 'border-brand-tan bg-brand-tan/60 text-brand-mocha';
}

function AssignStaffForm({ cafeId, onDone }: { cafeId: string; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignStaffPayload['role']>('manager');
  const { mutate, isPending, isSuccess } = useAssignStaff(cafeId);

  useEffect(() => {
    if (isSuccess) {
      setEmail('');
      onDone();
    }
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

function StaffList({ cafeId }: { cafeId: string }) {
  const { user } = useAuth();
  const { data: staff = [], isLoading, isError } = useCafeStaff(cafeId);
  const { mutate: removeStaff, isPending, variables: pendingUserId } = useRemoveStaff(cafeId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  if (isError) {
    return <p className="text-xs text-red-600">Couldn&apos;t load staff for this cafe.</p>;
  }

  if (staff.length === 0) {
    return <p className="text-xs text-brand-mocha">No staff assigned to this cafe yet.</p>;
  }

  return (
    <ul className="space-y-1.5">
      {staff.map((member) => {
        const isSelf = member.user_id === user?.id;
        return (
          <li
            key={member.user_id}
            className="flex items-center justify-between gap-2 rounded-lg border border-brand-brown/10 bg-white/90 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-brand-brown">
                {member.name} {isSelf && <span className="font-normal text-brand-mocha">(you)</span>}
              </p>
              <p className="truncate text-xs text-brand-mocha">{member.email}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${ROLE_BADGE_STYLES[member.role] ?? ROLE_BADGE_STYLES.staff}`}
              >
                {member.role}
              </span>
              {!isSelf && (
                <button
                  type="button"
                  onClick={() => removeStaff(member.user_id)}
                  disabled={isPending && pendingUserId === member.user_id}
                  aria-label={`Remove ${member.name}`}
                  className="rounded-full p-1.5 text-brand-mocha transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  {isPending && pendingUserId === member.user_id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CafeCard({ cafe }: { cafe: OrgCafe }) {
  const [managingStaff, setManagingStaff] = useState(false);

  return (
    <div className="bg-white/80 transition-colors hover:bg-brand-tan/10">
      <div className="flex flex-wrap items-center gap-4 px-5 py-4">
        <div className="flex min-w-[10rem] flex-1 items-center gap-2.5">
          <Link href={`/${cafe.slug}/dashboard`} className="group/link inline-flex items-center gap-1">
            <span className="font-display text-base font-bold leading-snug text-brand-brown">{cafe.name}</span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-brand-mocha opacity-0 transition-opacity group-hover/link:opacity-100" />
          </Link>
          <span
            className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusStyle(cafe.subscription_status)}`}
          >
            {cafe.subscription_status}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-sm text-brand-mocha">
          <Users className="h-4 w-4" />
          <span>
            <span className="font-semibold text-brand-brown">{cafe.today_reservation_count}</span>{' '}
            reservation{cafe.today_reservation_count === 1 ? '' : 's'} today
          </span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link
            href={`/${cafe.slug}/dashboard`}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-red px-3.5 py-1.5 text-sm font-semibold text-white shadow-brand-sm transition-colors hover:bg-brand-redDark"
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            View dashboard
          </Link>
          <button
            type="button"
            onClick={() => setManagingStaff((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded-full border border-brand-brown/15 px-3.5 py-1.5 text-sm font-semibold text-brand-red transition-colors hover:bg-brand-red/5"
          >
            <UserCog className="h-3.5 w-3.5" />
            Manage staff
          </button>
        </div>
      </div>

      {managingStaff && (
        <div className="space-y-4 border-t border-brand-brown/10 bg-brand-tan/10 px-5 py-4">
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-mochaMid">
              Current staff
            </h4>
            <StaffList cafeId={cafe._id} />
          </div>

          <div className="border-t border-brand-brown/10 pt-4">
            <h4 className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-brand-mochaMid">
              <Plus className="h-3 w-3" />
              Add staff member
            </h4>
            <AssignStaffForm cafeId={cafe._id} onDone={() => {}} />
          </div>
        </div>
      )}
    </div>
  );
}

function CafeCardSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="ml-auto h-8 w-24" />
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
        <div className="divide-y divide-brand-brown/10 overflow-hidden rounded-2xl border border-brand-brown/10 bg-white/80 shadow-brand-sm">
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
        <div className="divide-y divide-brand-brown/10 overflow-hidden rounded-2xl border border-brand-brown/10 bg-white/80 shadow-brand-sm">
          {cafes.map((cafe) => (
            <CafeCard key={cafe._id} cafe={cafe} />
          ))}
        </div>
      )}
    </div>
  );
}
