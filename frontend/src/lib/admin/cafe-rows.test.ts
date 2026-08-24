import { describe, test, expect, vi, afterEach } from 'vitest';
import { flattenCafeRows, filterCafeRows, sortCafeRows } from './cafe-rows';
import { OrgWithCafes, CafeWithSubscription } from '@/lib/types/models';

const makeCafe = (overrides: Partial<CafeWithSubscription> = {}): CafeWithSubscription => ({
  _id: 'cafe1',
  org_id: 'org1',
  name: 'Cafe One',
  slug: 'cafe-one',
  timezone: 'UTC',
  subscription_status: 'active',
  subscription: null,
  owner: null,
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const makeOrg = (overrides: Partial<OrgWithCafes> = {}): OrgWithCafes => ({
  _id: 'org1',
  name: 'Org One',
  cafes: [],
  ...overrides,
});

describe('flattenCafeRows', () => {
  test('produces one row per cafe with the owning org id and name attached', () => {
    const orgs: OrgWithCafes[] = [
      makeOrg({
        _id: 'org1',
        name: 'Acme Cafes',
        cafes: [makeCafe({ _id: 'cafe1', name: 'Acme Downtown' }), makeCafe({ _id: 'cafe2', name: 'Acme Uptown' })],
      }),
      makeOrg({ _id: 'org2', name: 'Beanhouse', cafes: [makeCafe({ _id: 'cafe3', name: 'Beanhouse Central' })] }),
    ];

    const rows = flattenCafeRows(orgs);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ cafe: orgs[0].cafes[0], orgId: 'org1', orgName: 'Acme Cafes' });
    expect(rows[2]).toEqual({ cafe: orgs[1].cafes[0], orgId: 'org2', orgName: 'Beanhouse' });
  });
});

describe('filterCafeRows', () => {
  const rows = flattenCafeRows([
    makeOrg({ _id: 'org1', name: 'Acme Cafes', cafes: [makeCafe({ _id: 'cafe1', name: 'Acme Downtown' })] }),
    makeOrg({ _id: 'org2', name: 'Beanhouse', cafes: [makeCafe({ _id: 'cafe2', name: 'Central Perk' })] }),
  ]);

  test('matches on cafe name, case-insensitively', () => {
    expect(filterCafeRows(rows, 'downtown')).toEqual([rows[0]]);
  });

  test('matches on org name, case-insensitively', () => {
    expect(filterCafeRows(rows, 'BEANHOUSE')).toEqual([rows[1]]);
  });

  test('returns every row for an empty or whitespace-only query', () => {
    expect(filterCafeRows(rows, '')).toEqual(rows);
    expect(filterCafeRows(rows, '   ')).toEqual(rows);
  });

  test('returns no rows when nothing matches', () => {
    expect(filterCafeRows(rows, 'nonexistent')).toEqual([]);
  });
});

describe('sortCafeRows', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('sorts by cafe name ascending and descending', () => {
    const rows = flattenCafeRows([
      makeOrg({ cafes: [makeCafe({ _id: 'c1', name: 'Zebra Cafe' }), makeCafe({ _id: 'c2', name: 'Alpha Cafe' })] }),
    ]);

    expect(sortCafeRows(rows, 'name', 'asc').map((r) => r.cafe.name)).toEqual(['Alpha Cafe', 'Zebra Cafe']);
    expect(sortCafeRows(rows, 'name', 'desc').map((r) => r.cafe.name)).toEqual(['Zebra Cafe', 'Alpha Cafe']);
  });

  test('sorts by cafe created_at ascending and descending', () => {
    const rows = flattenCafeRows([
      makeOrg({
        cafes: [
          makeCafe({ _id: 'c1', name: 'Newer', created_at: '2026-06-01T00:00:00.000Z' }),
          makeCafe({ _id: 'c2', name: 'Older', created_at: '2026-01-01T00:00:00.000Z' }),
        ],
      }),
    ]);

    expect(sortCafeRows(rows, 'date', 'asc').map((r) => r.cafe.name)).toEqual(['Older', 'Newer']);
    expect(sortCafeRows(rows, 'date', 'desc').map((r) => r.cafe.name)).toEqual(['Newer', 'Older']);
  });

  test('sorts by subscription time remaining, pushing no-countdown cafes to the end regardless of direction', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));

    const rows = flattenCafeRows([
      makeOrg({
        cafes: [
          makeCafe({
            _id: 'soon',
            name: 'Expires Soon',
            subscription: {
              _id: 's1', org_id: 'org1', cafe_id: 'soon', term_months: 1, price_per_month: 9000,
              period_start: '2026-05-01T00:00:00.000Z', current_period_end: '2026-06-10T00:00:00.000Z',
              status: 'active', is_current: true, created_at: '2026-05-01T00:00:00.000Z',
            },
          }),
          makeCafe({
            _id: 'later',
            name: 'Expires Later',
            subscription: {
              _id: 's2', org_id: 'org1', cafe_id: 'later', term_months: 12, price_per_month: 7000,
              period_start: '2026-01-01T00:00:00.000Z', current_period_end: '2027-01-01T00:00:00.000Z',
              status: 'active', is_current: true, created_at: '2026-01-01T00:00:00.000Z',
            },
          }),
          makeCafe({ _id: 'none', name: 'No Plan', subscription: null }),
          makeCafe({
            _id: 'lapsed',
            name: 'Already Lapsed',
            subscription: {
              _id: 's3', org_id: 'org1', cafe_id: 'lapsed', term_months: 1, price_per_month: 9000,
              period_start: '2026-01-01T00:00:00.000Z', current_period_end: '2026-02-01T00:00:00.000Z',
              status: 'inactive', is_current: true, created_at: '2026-01-01T00:00:00.000Z',
            },
          }),
        ],
      }),
    ]);

    const asc = sortCafeRows(rows, 'remaining', 'asc').map((r) => r.cafe.name);
    expect(asc.slice(0, 2)).toEqual(['Expires Soon', 'Expires Later']);
    expect(asc.slice(2)).toEqual(expect.arrayContaining(['No Plan', 'Already Lapsed']));

    const desc = sortCafeRows(rows, 'remaining', 'desc').map((r) => r.cafe.name);
    expect(desc.slice(0, 2)).toEqual(['Expires Later', 'Expires Soon']);
    expect(desc.slice(2)).toEqual(expect.arrayContaining(['No Plan', 'Already Lapsed']));
  });
});
