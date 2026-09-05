import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import RefundsOwedPage from './page';
import { useTenant } from '@/components/providers/tenant-provider';
import { useAuth } from '@/components/providers/auth-provider';
import { axiosInstance } from '@/hooks/api/axios-instance';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/providers/tenant-provider', () => ({ useTenant: vi.fn() }));
vi.mock('@/components/providers/auth-provider', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/api/axios-instance', () => ({
  axiosInstance: { get: vi.fn(), put: vi.fn() },
}));

const CAFE = { id: 'cafe_1', slug: 'demo-cafe', name: 'Demo Cafe' };

const owedEntry = {
  _id: 'res_1',
  status: 'CANCELLED',
  start_time: '2026-09-10T13:30:00.000Z',
  party_size: 2,
  guest: { _id: 'u1', name: 'Priya Sharma', email: 'priya@test.com' },
  amount: 250,
  currency: 'INR',
  payment_id: 'pay_ABC123',
  cancelled_at: '2026-09-08T10:00:00.000Z',
};

const withPermissions = (permissions: string[]) => {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: 'u_staff',
      staff_memberships: [{ cafe_id: 'cafe_1', role: 'host', permissions }],
    },
  } as never);
};

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RefundsOwedPage />
    </QueryClientProvider>
  );
};

describe('RefundsOwedPage', () => {
  beforeEach(() => {
    vi.mocked(useTenant).mockReturnValue({ cafe: CAFE } as never);
    vi.mocked(axiosInstance.get).mockReset();
    vi.mocked(axiosInstance.put).mockReset();
    withPermissions(['view_reservations', 'manage_billing']);
  });

  test('lists what is owed, to whom, and the total', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({ data: { data: [owedEntry] } });
    renderPage();

    expect(await screen.findByText('Priya Sharma')).toBeInTheDocument();
    expect(screen.getByText('pay_ABC123')).toBeInTheDocument();
    expect(screen.getByText('1 outstanding')).toBeInTheDocument();
  });

  test('shows a clear empty state when nothing is owed', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({ data: { data: [] } });
    renderPage();

    expect(await screen.findByText('Nothing owed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark refunded/i })).not.toBeInTheDocument();
  });

  describe('permissions', () => {
    test('a host without billing access sees the queue but no settle button', async () => {
      // The backend deliberately lets any host read the queue as part of
      // running the floor, while clearing an entry needs manage_billing.
      withPermissions(['view_reservations']);
      vi.mocked(axiosInstance.get).mockResolvedValue({ data: { data: [owedEntry] } });
      renderPage();

      expect(await screen.findByText('Priya Sharma')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /mark refunded/i })).not.toBeInTheDocument();
      expect(screen.getByText(/needs billing access/i)).toBeInTheDocument();
    });

    test('billing staff get the settle button and no restriction notice', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValue({ data: { data: [owedEntry] } });
      renderPage();

      expect(await screen.findByRole('button', { name: /mark refunded/i })).toBeInTheDocument();
      expect(screen.queryByText(/needs billing access/i)).not.toBeInTheDocument();
    });
  });

  describe('recording a refund', () => {
    const openDialog = async () => {
      vi.mocked(axiosInstance.get).mockResolvedValue({ data: { data: [owedEntry] } });
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: /mark refunded/i }));
      return screen.findByRole('dialog');
    };

    test('makes clear that no money is being sent', async () => {
      // Someone who believes this button pays the guest will leave people out
      // of pocket with the record saying they were paid.
      const dialog = await openDialog();
      // The sentence is split by a <strong>not</strong>, so match the whole
      // element's text rather than a single text node.
      expect(dialog).toHaveTextContent(/this does\s*not\s*send any money/i);
      expect(dialog).toHaveTextContent(/refund the guest from your razorpay account first/i);
    });

    test('refuses to submit without a reference', async () => {
      await openDialog();

      fireEvent.click(screen.getByRole('button', { name: /record refund/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/enter the reference/i);
      expect(axiosInstance.put).not.toHaveBeenCalled();
    });

    test('sends the reference and closes on success', async () => {
      vi.mocked(axiosInstance.put).mockResolvedValue({ data: { data: {} } });
      await openDialog();

      fireEvent.change(screen.getByLabelText(/refund reference/i), {
        target: { value: 'rfnd_XYZ789' },
      });
      fireEvent.click(screen.getByRole('button', { name: /record refund/i }));

      await waitFor(() =>
        expect(axiosInstance.put).toHaveBeenCalledWith(
          '/api/v1/cafes/cafe_1/reservations/res_1/refund-settled',
          { refund_reference: 'rfnd_XYZ789' },
          expect.objectContaining({ skipGlobalErrorToast: true })
        )
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    test('surfaces a server rejection next to the field rather than losing it', async () => {
      vi.mocked(axiosInstance.put).mockRejectedValue({
        response: { data: { error: { message: 'refund_reference is required' } } },
      });
      await openDialog();

      fireEvent.change(screen.getByLabelText(/refund reference/i), { target: { value: 'x' } });
      fireEvent.click(screen.getByRole('button', { name: /record refund/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/refund_reference is required/i);
      // The dialog stays open so the reference can be corrected.
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
