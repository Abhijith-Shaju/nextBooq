const { generateMergeCombinations } = require('../../src/services/allocationEngine');

describe('Table Allocation Engine - Detailed Unit Tests', () => {
  const table1 = { _id: 't1', table_number: 'T1', capacity: 2, can_merge_with: ['t2'] };
  const table2 = { _id: 't2', table_number: 'T2', capacity: 2, can_merge_with: ['t1', 't3'] };
  const table3 = { _id: 't3', table_number: 'T3', capacity: 4, can_merge_with: ['t2', 't4'] };
  const table4 = { _id: 't4', table_number: 'T4', capacity: 4, can_merge_with: ['t3'] };
  const tableIso = { _id: 'tIso', table_number: 'T99', capacity: 6, can_merge_with: [] };

  describe('generateMergeCombinations', () => {
    test('returns valid connected combinations for party size matching capacity sum', () => {
      const tables = [table1, table2, table3];
      const combos = generateMergeCombinations(tables, 6, 3);

      expect(combos.length).toBeGreaterThan(0);
      const comboNames = combos.map((c) => c.tables.map((t) => t.table_number).sort());
      // T2(2) + T3(4) = 6 capacity
      expect(comboNames).toContainEqual(['T2', 'T3']);
    });

    test('calculates correct excess capacity and table count for deterministic sorting', () => {
      const tables = [table1, table2, table3];
      const combos = generateMergeCombinations(tables, 5, 3);

      const t2t3Combo = combos.find(
        (c) => c.tables.length === 2 && c.tables.some((t) => t._id === 't2')
      );
      expect(t2t3Combo).toBeDefined();
      expect(t2t3Combo.totalCapacity).toBe(6);
      expect(t2t3Combo.excessCapacity).toBe(1); // 6 - 5
      expect(t2t3Combo.tableCount).toBe(2);
    });

    test('excludes isolated unconnected tables from merged combinations', () => {
      const tables = [table1, tableIso]; // T1 and T99 are not connected
      const combos = generateMergeCombinations(tables, 4, 3);
      expect(combos.length).toBe(0);
    });

    test('enforces max depth constraint of 3 tables', () => {
      const tables = [table1, table2, table3, table4];
      const combos = generateMergeCombinations(tables, 10, 3);

      combos.forEach((combo) => {
        expect(combo.tableCount).toBeLessThanOrEqual(3);
      });
    });

    test('returns empty array when party size exceeds max 3-table merged capacity', () => {
      const tables = [table1, table2, table3]; // Total capacity 2 + 2 + 4 = 8
      const combos = generateMergeCombinations(tables, 15, 3);
      expect(combos.length).toBe(0);
    });

    // L-05: previously every candidate combination was drawn from the whole
    // table list regardless of adjacency (~161,700 checks at 100 tables),
    // relying on the connectivity check to reject cross-cluster combos
    // afterwards. With a floor plan of mostly isolated tables (the common
    // case -- standard 2-tops with no merge partners), that's almost all
    // wasted work. This asserts the fix stays fast at a scale where the old
    // O(n^3)-ish enumeration would not.
    test('stays fast with many isolated tables and only a small merge cluster', () => {
      const isolatedTables = Array.from({ length: 300 }, (_, i) => ({
        _id: `iso${i}`,
        table_number: `I${i}`,
        capacity: 2,
        can_merge_with: [],
      }));
      const mergeableTables = [table1, table2, table3, table4];
      const tables = [...isolatedTables, ...mergeableTables];

      const start = Date.now();
      const combos = generateMergeCombinations(tables, 6, 3);
      const elapsedMs = Date.now() - start;

      expect(elapsedMs).toBeLessThan(500);
      const comboNames = combos.map((c) => c.tables.map((t) => t.table_number).sort());
      expect(comboNames).toContainEqual(['T2', 'T3']);
      combos.forEach((combo) => {
        combo.tables.forEach((t) => expect(t.table_number.startsWith('I')).toBe(false));
      });
    });

    // Same connectivity semantics as before -- reachability doesn't require
    // the mutual (both-directions) can_merge_with entry that the small
    // fixture tables above happen to have; a one-directional edge is
    // sufficient for a pair, matching the pre-existing isConnected check
    // this refactor preserves unchanged.
    test('still honors one-directional can_merge_with edges within a component', () => {
      const a = { _id: 'a', table_number: 'A', capacity: 2, can_merge_with: ['b'] };
      const b = { _id: 'b', table_number: 'B', capacity: 4, can_merge_with: [] };
      const combos = generateMergeCombinations([a, b], 6, 3);
      expect(combos.length).toBe(1);
      expect(combos[0].tables.map((t) => t.table_number).sort()).toEqual(['A', 'B']);
    });
  });
});
