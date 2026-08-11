import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { SubscriptionDrawer } from './subscription-drawer';
import { axiosInstance } from '@/hooks/api/axios-instance';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/api/axios-instance', () => ({
  axiosInstance: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const renderDrawer = (props: Partial<React.ComponentProps<typeof SubscriptionDrawer>> = {}) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SubscriptionDrawer cafeId="cafe1" orgId="org1" onClose={vi.fn()} {...props} />
    </QueryClientProvider>
  );
};

describe('SubscriptionDrawer', () => {
  beforeEach(() => {
    vi.mocked(axiosInstance.get).mockReset();
    vi.mocked(axiosInstance.post).mockReset();
    vi.mocked(axiosInstance.patch).mockReset();
  });

  test('renders nothing when cafeId is null', () => {
    renderDrawer({ cafeId: null });
    expect(screen.queryByText(/record payment/i)).not.toBeInTheDocument();
  });

  test('renders subscription history for the given cafe', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({
      data: {
        data: [
          { _id: 's2', term_months: 12, price_per_month: 7000, status: 'active', period_start: '2026-03-01T00:00:00.000Z', current_period_end: '2027-03-01T00:00:00.000Z' },
          { _id: 's1', term_months: 1, price_per_month: 9000, status: 'inactive', period_start: '2026-01-01T00:00:00.000Z', current_period_end: '2026-02-01T00:00:00.000Z' },
        ],
      },
    });

    renderDrawer();

    await waitFor(() => expect(screen.getAllByText(/₹7000\/mo/i)[0]).toBeInTheDocument());
    expect(screen.getByText(/₹9000\/mo/i)).toBeInTheDocument();
  });

  test('submitting the record-term form calls the record endpoint with the right payload', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({ data: { data: [] } });
    vi.mocked(axiosInstance.post).mockResolvedValue({
      data: { data: { _id: 'new-sub', term_months: 12, price_per_month: 7000, status: 'active' } },
    });

    renderDrawer();

    await waitFor(() => expect(screen.getByLabelText(/term/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/term/i), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/price per month/i), { target: { value: '7000' } });
    fireEvent.click(screen.getByRole('button', { name: /record payment/i }));

    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledTimes(1));
    expect(vi.mocked(axiosInstance.post).mock.calls[0][0]).toBe(
      '/api/v1/platform-admin/cafes/cafe1/subscriptions'
    );
    expect(vi.mocked(axiosInstance.post).mock.calls[0][1]).toMatchObject({
      org_id: 'org1',
      term_months: 12,
      price_per_month: 7000,
    });
  });

  test('clicking a status button calls the status endpoint', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({
      data: { data: [{ _id: 's1', term_months: 1, price_per_month: 9000, status: 'active', period_start: '2026-01-01T00:00:00.000Z', current_period_end: '2026-02-01T00:00:00.000Z' }] },
    });
    vi.mocked(axiosInstance.patch).mockResolvedValue({
      data: { data: { _id: 's1', status: 'inactive' } },
    });

    renderDrawer();

    await waitFor(() => expect(screen.getByRole('button', { name: /disable/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /disable/i }));

    await waitFor(() => expect(axiosInstance.patch).toHaveBeenCalledTimes(1));
    expect(vi.mocked(axiosInstance.patch).mock.calls[0][0]).toBe(
      '/api/v1/platform-admin/cafes/cafe1/subscriptions/status'
    );
    expect(vi.mocked(axiosInstance.patch).mock.calls[0][1]).toMatchObject({ status: 'inactive' });
  });

  test('hides the status-change buttons when the cafe has no subscription yet', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({ data: { data: [] } });

    renderDrawer();

    await waitFor(() => expect(screen.getByText(/no plan set/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /disable/i })).not.toBeInTheDocument();
  });

  test('typed form values do not leak when the component remounts for a different cafe (simulating a key change)', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({ data: { data: [] } });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <SubscriptionDrawer key="cafe1" cafeId="cafe1" orgId="org1" onClose={vi.fn()} />
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByLabelText(/note/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: 'Note for cafe1' } });
    expect(screen.getByLabelText(/note/i)).toHaveValue('Note for cafe1');

    // Simulate page.tsx's `key={selectedCafeId}` forcing a remount when the
    // admin selects a different cafe, by rendering a new element with a
    // different key (React Testing Library's rerender respects key changes
    // the same way a real re-render would, unmounting the old instance).
    rerender(
      <QueryClientProvider client={queryClient}>
        <SubscriptionDrawer key="cafe2" cafeId="cafe2" orgId="org1" onClose={vi.fn()} />
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByLabelText(/note/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/note/i)).toHaveValue('');
  });
});
