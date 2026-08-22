import type { Table } from '@/lib/types/models';

export function getMergePartnerTableNumbers(table: Pick<Table, 'can_merge_with'>): string[] {
  return (table.can_merge_with || [])
    .map((ref) => (typeof ref === 'string' ? null : ref.table_number))
    .filter((n): n is string => Boolean(n));
}

/**
 * IDs of a table's merge partners. Only meaningful when can_merge_with is
 * populated (GET /tables populates it with {_id, table_number}) — a bare
 * ObjectId string ref has no _id to read, so it's skipped.
 */
export function getMergePartnerIds(table: Pick<Table, 'can_merge_with'>): string[] {
  return (table.can_merge_with || [])
    .map((ref) => (typeof ref === 'string' ? null : ref._id || ref.id))
    .filter((id): id is string => Boolean(id));
}
