import { describe, expect, test } from 'vitest';
import { describeTableStatus } from './table-status';

describe('describeTableStatus', () => {
  test('active is a success-toned "Active" badge', () => {
    expect(describeTableStatus('active')).toEqual({ label: 'Active', tone: 'success' });
  });

  test('out_of_service is a critical-toned "Out of service" badge', () => {
    expect(describeTableStatus('out_of_service')).toEqual({ label: 'Out of service', tone: 'critical' });
  });
});
