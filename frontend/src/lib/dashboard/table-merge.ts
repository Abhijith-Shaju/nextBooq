import type { Table } from '@/lib/types/models';

export function getMergePartnerTableNumbers(table: Pick<Table, 'can_merge_with'>): string[] {
  return (table.can_merge_with || [])
    .map((ref) => (typeof ref === 'string' ? null : ref.table_number))
    .filter((n): n is string => Boolean(n));
}
