const { generateMergeCombinations } = require('../../src/services/allocationEngine');

describe('Table Allocation Engine Unit Tests', () => {
  const tableA = { _id: 't1', table_number: 'T1', capacity: 2, can_merge_with: ['t2'] };
  const tableB = { _id: 't2', table_number: 'T2', capacity: 2, can_merge_with: ['t1', 't3'] };
  const tableC = { _id: 't3', table_number: 'T3', capacity: 4, can_merge_with: ['t2'] };
  const tableD = { _id: 't4', table_number: 'T4', capacity: 2, can_merge_with: [] }; // Isolated table

  test('generates valid connected combinations for party of 6', () => {
    const tables = [tableA, tableB, tableC, tableD];
    const combinations = generateMergeCombinations(tables, 6, 3);

    expect(combinations.length).toBeGreaterThan(0);
    // Combination T2 + T3 (capacity 6) or T1 + T2 + T3 (capacity 8)
    const validCombos = combinations.map((c) => c.tables.map((t) => t.table_number).sort());
    expect(validCombos).toContainEqual(['T2', 'T3']);
  });

  test('does not include unconnected isolated tables in combinations', () => {
    const tables = [tableA, tableD]; // T1 and T4 are not mergeable
    const combinations = generateMergeCombinations(tables, 4, 3);
    expect(combinations.length).toBe(0);
  });

  test('respects max depth constraint of 3 tables', () => {
    const tableE = { _id: 't5', table_number: 'T5', capacity: 2, can_merge_with: ['t3'] };
    const tables = [tableA, tableB, tableC, tableE];
    const combinations = generateMergeCombinations(tables, 10, 3);

    // Max depth of 3 cannot combine 4 tables even if connected
    combinations.forEach((combo) => {
      expect(combo.tableCount).toBeLessThanOrEqual(3);
    });
  });
});
