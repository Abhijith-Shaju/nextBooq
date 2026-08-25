import { describe, test, expect, vi, beforeEach } from 'vitest';
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
