import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from 'sonner';
import { handleResponseError } from './axios-instance';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/query-client', () => ({
  queryClient: { setQueryData: vi.fn() },
}));

vi.mock('@/lib/route-guard', () => ({
  isDashboardRoute: () => false,
}));

// axiosInstance is created once at module load from process.env, so each
// case has to reset the module registry and re-import to see a new value.
// The vi.mock() calls above are hoisted and stay registered across
// vi.resetModules(), so the re-imported module still gets mocked sonner /
// query-client / route-guard instead of the real ones.
const loadInstance = async () => {
  vi.resetModules();
  const mod = await import('./axios-instance');
  return mod.axiosInstance;
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('axiosInstance', () => {
  test('targets NEXT_PUBLIC_API_URL when it is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.nextbooq.in');

    const instance = await loadInstance();

    expect(instance.defaults.baseURL).toBe('https://api.nextbooq.in');
  });

  test('falls back to a relative baseURL when NEXT_PUBLIC_API_URL is unset', async () => {
    // undefined (not '') so the variable is actually deleted from
    // process.env, genuinely exercising the `?? ''` fallback rather than
    // just passing an empty string straight through.
    vi.stubEnv('NEXT_PUBLIC_API_URL', undefined);

    const instance = await loadInstance();

    expect(instance.defaults.baseURL).toBe('');
  });

  test('treats an explicitly empty string as a valid relative baseURL', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');

    const instance = await loadInstance();

    expect(instance.defaults.baseURL).toBe('');
  });

  test('sends credentials so the session cookie rides along cross-origin', async () => {
    // Without this the browser would omit the nb_session cookie on every
    // request to api.nextbooq.in and the whole app would be unauthenticated.
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.nextbooq.in');

    const instance = await loadInstance();

    expect(instance.defaults.withCredentials).toBe(true);
  });
});

// L-07: a call site that shows its own error UI for a request could not
// opt out of the interceptor's generic toast, so failures like the
// resend-verification-email banner action showed two error messages —
// one generic, one specific.
describe('handleResponseError skipGlobalErrorToast opt-out', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
  });

  test('does not toast when the request config opts out', async () => {
    const error = {
      config: { skipGlobalErrorToast: true },
      response: { status: 500, data: { message: 'boom' } },
    };

    await expect(handleResponseError(error)).rejects.toBe(error);
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('still toasts normally when the request does not opt out', async () => {
    const error = {
      config: {},
      response: { status: 500, data: { message: 'boom' } },
    };

    await expect(handleResponseError(error)).rejects.toBe(error);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  test('the opted-out request still rejects the promise so the caller\'s own catch/onError runs', async () => {
    const error = { config: { skipGlobalErrorToast: true }, response: { status: 400, data: {} } };

    await expect(handleResponseError(error)).rejects.toBe(error);
  });
});
