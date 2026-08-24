import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import AdminOverviewPage from './page';
import { axiosInstance } from '@/hooks/api/axios-instance';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

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
                cafes: [{ _id: 'cafe1', name: 'Unconfigured Cafe', slug: 'unconf', subscription: null, subscription_status: 'active' }],
              },
            ],
          },
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Unconfigured Cafe')).toBeInTheDocument());
    expect(screen.getByText('Unconfigured Cafe')).toBeInTheDocument();
    expect(screen.getByText(/unconfigured \(active\)/i)).toBeInTheDocument();
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

  test('shows a countdown of time remaining next to the renewal date', async () => {
    const tenDaysFromNow = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

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
                name: 'Countdown Org',
                cafes: [{
                  _id: 'cafe1',
                  name: 'Countdown Cafe',
                  slug: 'countdown',
                  subscription: { _id: 'sub1', term_months: 1, price_per_month: 9000, status: 'active', current_period_end: tenDaysFromNow },
                }],
              },
            ],
          },
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Countdown Cafe')).toBeInTheDocument());
    expect(screen.getByText(/\(\d+ days? left\)/i)).toBeInTheDocument();
  });

  test('shows an "Expired ... ago" countdown for a lapsed subscription', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    vi.mocked(axiosInstance.get).mockImplementation((url: string) => {
      if (url === '/api/v1/platform-admin/overview') {
        return Promise.resolve({
          data: { data: { org_count: 1, cafe_count: 1, status_counts: { trial: 0, active: 0, past_due: 1, inactive: 0 }, pending_count: 0, revenue: 0 } },
        });
      }
      if (url === '/api/v1/platform-admin/orgs') {
        return Promise.resolve({
          data: {
            data: [
              {
                _id: 'org1',
                name: 'Lapsed Org',
                cafes: [{
                  _id: 'cafe1',
                  name: 'Lapsed Cafe',
                  slug: 'lapsed',
                  subscription: { _id: 'sub1', term_months: 1, price_per_month: 9000, status: 'past_due', current_period_end: tenDaysAgo },
                }],
              },
            ],
          },
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Lapsed Cafe')).toBeInTheDocument());
    expect(screen.getByText(/\(expired \d+ days? ago\)/i)).toBeInTheDocument();
  });

  const buildOrgsResponse = (cafeCount: number) => ({
    data: {
      data: [
        {
          _id: 'org1',
          name: 'Big Org',
          cafes: Array.from({ length: cafeCount }, (_, i) => ({
            _id: `cafe${i + 1}`,
            name: `Cafe ${String(i + 1).padStart(2, '0')}`,
            slug: `cafe-${i + 1}`,
            subscription: null,
            subscription_status: 'active',
            owner: null,
            created_at: '2026-01-01T00:00:00.000Z',
          })),
        },
      ],
    },
  });

  const mockOverviewAnd = (orgsResponse: unknown) => {
    vi.mocked(axiosInstance.get).mockImplementation((url: string) => {
      if (url === '/api/v1/platform-admin/overview') {
        return Promise.resolve({
          data: { data: { org_count: 1, cafe_count: 1, status_counts: { trial: 0, active: 0, past_due: 0, inactive: 0 }, pending_count: 0, revenue: 0 } },
        });
      }
      if (url === '/api/v1/platform-admin/orgs') {
        return Promise.resolve(orgsResponse);
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
  };

  test('filters the cafe list by cafe name as the admin types', async () => {
    mockOverviewAnd({
      data: {
        data: [
          { _id: 'org1', name: 'Org A', cafes: [{ _id: 'c1', name: 'Roastery North', slug: 'rn', subscription: null, subscription_status: 'active', owner: null, created_at: '2026-01-01T00:00:00.000Z' }] },
          { _id: 'org2', name: 'Org B', cafes: [{ _id: 'c2', name: 'Central Perk', slug: 'cp', subscription: null, subscription_status: 'active', owner: null, created_at: '2026-01-01T00:00:00.000Z' }] },
        ],
      },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Roastery North')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/search cafes/i), { target: { value: 'central' } });

    expect(screen.queryByText('Roastery North')).not.toBeInTheDocument();
    expect(screen.getByText('Central Perk')).toBeInTheDocument();
  });

  test('filters the cafe list by organization name as the admin types', async () => {
    mockOverviewAnd({
      data: {
        data: [
          { _id: 'org1', name: 'Roastery Group', cafes: [{ _id: 'c1', name: 'Store One', slug: 's1', subscription: null, subscription_status: 'active', owner: null, created_at: '2026-01-01T00:00:00.000Z' }] },
          { _id: 'org2', name: 'Bean Co', cafes: [{ _id: 'c2', name: 'Store Two', slug: 's2', subscription: null, subscription_status: 'active', owner: null, created_at: '2026-01-01T00:00:00.000Z' }] },
        ],
      },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Store One')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/search cafes/i), { target: { value: 'bean co' } });

    expect(screen.queryByText('Store One')).not.toBeInTheDocument();
    expect(screen.getByText('Store Two')).toBeInTheDocument();
  });

  test('reverses row order when the sort direction is toggled', async () => {
    mockOverviewAnd({
      data: {
        data: [
          { _id: 'org1', name: 'Org A', cafes: [
            { _id: 'c1', name: 'Alpha', slug: 'a', subscription: null, subscription_status: 'active', owner: null, created_at: '2026-01-01T00:00:00.000Z' },
            { _id: 'c2', name: 'Zeta', slug: 'z', subscription: null, subscription_status: 'active', owner: null, created_at: '2026-01-01T00:00:00.000Z' },
          ] },
        ],
      },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    const rowsBefore = screen.getAllByRole('row').slice(1); // drop the header row
    expect(rowsBefore[0]).toHaveTextContent('Alpha');

    fireEvent.click(screen.getByRole('button', { name: /sort (ascending|descending)/i }));

    const rowsAfter = screen.getAllByRole('row').slice(1);
    expect(rowsAfter[0]).toHaveTextContent('Zeta');
  });

  test('paginates beyond the first page and disables Prev/Next at the boundaries', async () => {
    mockOverviewAnd(buildOrgsResponse(12));

    renderPage();

    await waitFor(() => expect(screen.getByText('Cafe 01')).toBeInTheDocument());
    expect(screen.queryByText('Cafe 11')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));

    await waitFor(() => expect(screen.getByText('Cafe 11')).toBeInTheDocument());
    expect(screen.queryByText('Cafe 01')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled();
  });

  test('shows "No cafes yet." when there are zero cafes and no search query', async () => {
    mockOverviewAnd({ data: { data: [] } });

    renderPage();

    await waitFor(() => expect(screen.getByText('No cafes yet.')).toBeInTheDocument());
    expect(screen.queryByText('No cafes match your search.')).not.toBeInTheDocument();
  });

  test('shows "No cafes match your search." when a search query matches nothing', async () => {
    mockOverviewAnd({
      data: {
        data: [
          { _id: 'org1', name: 'Org A', cafes: [{ _id: 'c1', name: 'Roastery North', slug: 'rn', subscription: null, subscription_status: 'active', owner: null, created_at: '2026-01-01T00:00:00.000Z' }] },
        ],
      },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Roastery North')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/search cafes/i), { target: { value: 'nonexistent cafe xyz' } });

    expect(screen.queryByText('Roastery North')).not.toBeInTheDocument();
    expect(screen.getByText('No cafes match your search.')).toBeInTheDocument();
    expect(screen.queryByText('No cafes yet.')).not.toBeInTheDocument();
  });

  test('opens the drawer with the correct cafe owner when clicking a row from a filtered list', async () => {
    const firstOwner = { name: 'Alice First', email: 'alice@example.com', phone: '+15550000001' };
    const secondOwner = { name: 'Bob Second', email: 'bob@example.com', phone: '+15550000002' };

    vi.mocked(axiosInstance.get).mockImplementation((url: string) => {
      if (url === '/api/v1/platform-admin/overview') {
        return Promise.resolve({
          data: { data: { org_count: 2, cafe_count: 2, status_counts: { trial: 0, active: 0, past_due: 0, inactive: 0 }, pending_count: 0, revenue: 0 } },
        });
      }
      if (url === '/api/v1/platform-admin/orgs') {
        return Promise.resolve({
          data: {
            data: [
              {
                _id: 'org1',
                name: 'Org A',
                cafes: [{
                  _id: 'cafe1',
                  name: 'Alpha Cafe',
                  slug: 'alpha-cafe',
                  subscription: null,
                  subscription_status: 'active',
                  owner: firstOwner,
                  created_at: '2026-01-01T00:00:00.000Z',
                }],
              },
              {
                _id: 'org2',
                name: 'Org B',
                cafes: [{
                  _id: 'cafe2',
                  name: 'Beta Cafe',
                  slug: 'beta-cafe',
                  subscription: null,
                  subscription_status: 'active',
                  owner: secondOwner,
                  created_at: '2026-01-01T00:00:00.000Z',
                }],
              },
            ],
          },
        });
      }
      if (url === '/api/v1/platform-admin/cafes/cafe2/subscriptions') {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Alpha Cafe')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/search cafes/i), { target: { value: 'beta' } });

    expect(screen.queryByText('Alpha Cafe')).not.toBeInTheDocument();
    expect(screen.getByText('Beta Cafe')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Beta Cafe'));

    await waitFor(() =>
      expect(screen.getByRole('link', { name: secondOwner.email })).toHaveAttribute(
        'href',
        `mailto:${secondOwner.email}`
      )
    );
    expect(screen.queryByText(firstOwner.email)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: firstOwner.email })).not.toBeInTheDocument();
  });
});
