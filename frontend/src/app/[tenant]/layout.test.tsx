import { beforeEach, describe, expect, test, vi } from 'vitest';
import TenantLayout from './layout';

const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound: notFoundMock }));
vi.mock('@/lib/resolve-tenant-cafe', () => ({
  resolveTenantCafe: vi.fn().mockResolvedValue({
    cafe: { id: 'cafe-1', slug: 'about', name: 'About Cafe' },
  }),
}));
vi.mock('@/components/providers/tenant-provider', () => ({
  TenantProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe('TenantLayout', () => {
  beforeEach(() => {
    notFoundMock.mockClear();
  });

  test.each(['about', 'contact'])('returns 404 for the reserved %s marketing path', async (tenant) => {
    await expect(
      TenantLayout({ children: <div />, params: Promise.resolve({ tenant }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });
});
