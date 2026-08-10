import { describe, expect, test } from 'vitest';
import { getMergePartnerTableNumbers } from './table-merge';
import type { Table } from '@/lib/types/models';

describe('getMergePartnerTableNumbers', () => {
  test('extracts table numbers from populated can_merge_with refs (real API shape)', () => {
    const table = {
      can_merge_with: [
        { _id: 't2', table_number: '2' },
        { _id: 't3', table_number: '3' },
      ],
    } as Pick<Table, 'can_merge_with'>;

    expect(getMergePartnerTableNumbers(table)).toEqual(['2', '3']);
  });

  test('returns an empty array for unpopulated id strings (nothing to display)', () => {
    const table = { can_merge_with: ['t2', 't3'] } as Pick<Table, 'can_merge_with'>;
    expect(getMergePartnerTableNumbers(table)).toEqual([]);
  });

  test('returns an empty array when can_merge_with is missing', () => {
    expect(getMergePartnerTableNumbers({})).toEqual([]);
  });
});
