import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import AdminOverviewPage from './page';
import { axiosInstance } from '@/hooks/api/axios-instance';

vi.mock('@/hooks/api/axios-instance', () => ({
  axiosInstance: { get: vi.fn() },
}));

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminOverviewPage />
    </QueryClientProvider>
  );
};

describe('AdminOverviewPage', () => {
  beforeEach(() => {
    vi.mocked(axiosInstance.get).mockReset();
  });

  test('renders computed overview stats', async () => {
    vi.mocked(axiosInstance.get).mockImplementation((url: string) => {
      if (url === '/api/v1/platform-admin/overview') {
        return Promise.resolve({
          data: {
            data: {
              org_count: 3,
              cafe_count: 5,
              status_counts: { trial: 1, active: 3, past_due: 1, inactive: 0 },
              pending_count: 2,
              revenue: 91000,
            },
          },
        });
      }
      if (url === '/api/v1/platform-admin/orgs') {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('91000')).toBeInTheDocument());
    expect(screen.getByText('3')).toBeInTheDocument(); // org_count
    expect(screen.getByText('5')).toBeInTheDocument(); // cafe_count
    expect(screen.getByText('2')).toBeInTheDocument(); // pending_count
  });

  test('renders an "Unconfigured" badge for a cafe with no subscription', async () => {
    vi.mocked(axiosInstance.get).mockImplementation((url: string) => {
      if (url === '/api/v1/platform-admin/overview') {
        return Promise.resolve({
          data: { data: { org_count: 1, cafe_count: 1, status_counts: { trial: 0, active: 0, past_due: 0, inactive: 0 }, pending_count: 0, revenue: 0 } },
        });
      }
      if (url === '/api/v1/platform-admin/orgs') {
        return Promise.resolve({
          data: {
            data: [
              {
                _id: 'org1',
                name: 'Unconfigured Org',
                cafes: [{ _id: 'cafe1', name: 'Unconfigured Cafe', slug: 'unconf', subscription: null }],
              },
            ],
          },
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Unconfigured Cafe')).toBeInTheDocument());
    // Exact match (not the /unconfigured/i regex from the brief): the regex
    // also matches the "Unconfigured Cafe" cell text itself, causing a
    // "multiple elements found" error unrelated to whether the badge renders.
    expect(screen.getByText('Unconfigured')).toBeInTheDocument();
  });

  test('clicking a cafe row selects it', async () => {
    vi.mocked(axiosInstance.get).mockImplementation((url: string) => {
      if (url === '/api/v1/platform-admin/overview') {
        return Promise.resolve({
          data: { data: { org_count: 1, cafe_count: 1, status_counts: { trial: 0, active: 1, past_due: 0, inactive: 0 }, pending_count: 0, revenue: 9000 } },
        });
      }
      if (url === '/api/v1/platform-admin/orgs') {
        return Promise.resolve({
          data: {
            data: [
              {
                _id: 'org1',
                name: 'Selectable Org',
                cafes: [{
                  _id: 'cafe1',
                  name: 'Selectable Cafe',
                  slug: 'selectable',
                  subscription: { _id: 'sub1', term_months: 1, price_per_month: 9000, status: 'active', current_period_end: '2027-01-01T00:00:00.000Z' },
                }],
              },
            ],
          },
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Selectable Cafe')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Selectable Cafe'));

    expect(screen.getByRole('row', { name: /selectable cafe/i })).toHaveAttribute('aria-selected', 'true');
  });
});
