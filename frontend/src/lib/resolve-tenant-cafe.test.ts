import { describe, test, expect, vi } from 'vitest';
import { resolveTenantCafe } from './resolve-tenant-cafe';

const jsonResponse = (body: unknown, ok = true) => ({
  ok,
  json: async () => body,
});

describe('resolveTenantCafe', () => {
  test('returns the cafe when the backend responds with a successful lookup', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ status: 'success', data: { _id: 'cafe_1', slug: 'demo', name: 'Demo', timezone: 'UTC' } })
    );

    const result = await resolveTenantCafe({
      tenant: 'demo',
      apiUrl: 'http://backend.internal',
      nodeEnv: 'production',
      fetchImpl,
    });

    expect('cafe' in result && result.cafe.id).toBe('cafe_1');
    expect(fetchImpl).toHaveBeenCalledWith('http://backend.internal/api/v1/cafes/slug/demo', { cache: 'no-store' });
  });

  test('reports notFound when the backend responds but the cafe genuinely does not exist, even in development', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: 'fail', message: 'Cafe not found' }, false));

    const result = await resolveTenantCafe({
      tenant: 'nonexistent',
      apiUrl: 'http://backend.internal',
      nodeEnv: 'development',
      fetchImpl,
    });

    expect(result).toEqual({ notFound: true });
  });

  test('reports notFound when the backend response is not valid JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('Unexpected token');
      },
    });

    const result = await resolveTenantCafe({
      tenant: 'demo',
      apiUrl: 'http://backend.internal',
      nodeEnv: 'production',
      fetchImpl,
    });

    expect(result).toEqual({ notFound: true });
  });

  test('in development, falls back to a mock cafe when the backend is entirely unreachable (network error)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await resolveTenantCafe({
      tenant: 'demo',
      apiUrl: 'http://backend.internal',
      nodeEnv: 'development',
      fetchImpl,
    });

    expect('cafe' in result && result.cafe.slug).toBe('demo');
  });

  test('in production, a network error reports notFound rather than faking a cafe', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await resolveTenantCafe({
      tenant: 'demo',
      apiUrl: 'http://backend.internal',
      nodeEnv: 'production',
      fetchImpl,
    });

    expect(result).toEqual({ notFound: true });
  });
});
