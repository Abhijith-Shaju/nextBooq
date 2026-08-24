import { OrgWithCafes, CafeWithSubscription } from '@/lib/types/models';

export interface CafeRow {
  cafe: CafeWithSubscription;
  orgId: string;
  orgName: string;
}

export type SortField = 'name' | 'date' | 'remaining';
export type SortDir = 'asc' | 'desc';

export function flattenCafeRows(orgs: OrgWithCafes[]): CafeRow[] {
  return orgs.flatMap((org) =>
    org.cafes.map((cafe) => ({ cafe, orgId: org._id, orgName: org.name }))
  );
}

export function filterCafeRows(rows: CafeRow[], query: string): CafeRow[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return rows;
  return rows.filter(
    (row) =>
      row.cafe.name.toLowerCase().includes(trimmed) || row.orgName.toLowerCase().includes(trimmed)
  );
}

// Positive milliseconds remaining on the cafe's current subscription, or
// null if it has no subscription or the current one has already lapsed —
// used to push those cafes to the end when sorting by time remaining.
function remainingMs(cafe: CafeWithSubscription): number | null {
  if (!cafe.subscription) return null;
  const ms = new Date(cafe.subscription.current_period_end).getTime() - Date.now();
  return ms > 0 ? ms : null;
}

export function sortCafeRows(rows: CafeRow[], field: SortField, dir: SortDir): CafeRow[] {
  const sign = dir === 'asc' ? 1 : -1;

  if (field === 'name') {
    return [...rows].sort((a, b) => sign * a.cafe.name.localeCompare(b.cafe.name));
  }

  if (field === 'date') {
    return [...rows].sort(
      (a, b) =>
        sign * (new Date(a.cafe.created_at).getTime() - new Date(b.cafe.created_at).getTime())
    );
  }

  const withRemaining = rows.filter((row) => remainingMs(row.cafe) !== null);
  const withoutRemaining = rows.filter((row) => remainingMs(row.cafe) === null);
  withRemaining.sort((a, b) => sign * (remainingMs(a.cafe)! - remainingMs(b.cafe)!));
  return [...withRemaining, ...withoutRemaining];
}
