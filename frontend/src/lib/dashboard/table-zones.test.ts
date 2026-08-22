import { describe, expect, test } from 'vitest';
import { groupTablesByZone } from './table-zones';
import type { Table } from '@/lib/types/models';

const table = (overrides: Partial<Table> = {}): Table => ({
  id: 't1',
  cafe_id: 'cafe1',
  table_number: '1',
  capacity: 4,
  zone: 'indoor',
  floor: 1,
  status: 'active',
  ...overrides,
});

describe('groupTablesByZone', () => {
  test('buckets tables under their own zone', () => {
    const groups = groupTablesByZone([
      table({ id: 'a', zone: 'window' }),
      table({ id: 'b', zone: 'outdoor' }),
      table({ id: 'c', zone: 'window' }),
    ]);

    const windowGroup = groups.find((g) => g.zone === 'window');
    expect(windowGroup?.tables.map((t) => t.id)).toEqual(['a', 'c']);
    expect(groups.find((g) => g.zone === 'outdoor')?.tables.map((t) => t.id)).toEqual(['b']);
  });

  test('omits zones with no tables rather than rendering an empty group', () => {
    const groups = groupTablesByZone([table({ id: 'a', zone: 'indoor' })]);

    expect(groups).toHaveLength(1);
    expect(groups[0].zone).toBe('indoor');
  });

  test('returns groups in the fixed display order regardless of input order', () => {
    const groups = groupTablesByZone([
      table({ id: 'a', zone: 'private' }),
      table({ id: 'b', zone: 'window' }),
      table({ id: 'c', zone: 'indoor' }),
    ]);

    expect(groups.map((g) => g.zone)).toEqual(['window', 'indoor', 'private']);
  });

  test('each group carries a human-readable label', () => {
    const groups = groupTablesByZone([table({ zone: 'outdoor' })]);

    expect(groups[0].label).toBe('Outdoor');
  });
});
