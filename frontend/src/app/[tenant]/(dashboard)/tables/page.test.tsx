import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import TablesInventoryPage from './page';

vi.mock('@/components/providers/tenant-provider', () => ({
  useTenant: () => ({ cafe: { id: 'cafe_1', slug: 'demo-cafe' } }),
}));

const mockUseAuth = vi.fn();
vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

const mockUseTables = vi.fn();
vi.mock('@/hooks/admin/use-tables', () => ({
  useTables: (...args: unknown[]) => mockUseTables(...args),
}));

vi.mock('@/hooks/api/axios-instance', () => ({
  axiosInstance: { post: vi.fn(), put: vi.fn(), get: vi.fn() },
}));

const managerUser = {
  staff_memberships: [{ cafe_id: 'cafe_1', role: 'manager', permissions: ['edit_tables'] }],
};
const staffUser = {
  staff_memberships: [{ cafe_id: 'cafe_1', role: 'staff', permissions: ['view_reservations'] }],
};

const renderPage = () => {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <TablesInventoryPage />
    </QueryClientProvider>
  );
};

describe('TablesInventoryPage error vs. empty state', () => {
  test('shows a distinct error message when the fetch fails, not the empty-state message', () => {
    mockUseAuth.mockReturnValue({ user: managerUser });
    mockUseTables.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    renderPage();

    expect(screen.getByText(/couldn.t load tables/i)).toBeInTheDocument();
    expect(screen.queryByText(/no physical tables/i)).not.toBeInTheDocument();
  });

  test('shows the empty-state message when the fetch succeeds with zero results', () => {
    mockUseAuth.mockReturnValue({ user: managerUser });
    mockUseTables.mockReturnValue({ data: [], isLoading: false, isError: false });

    renderPage();

    expect(screen.getByText(/no physical tables created yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn.t load tables/i)).not.toBeInTheDocument();
  });

  test('hides Add table and per-row edit controls for a user without edit_tables permission', () => {
    mockUseAuth.mockReturnValue({ user: staffUser });
    mockUseTables.mockReturnValue({ data: [], isLoading: false, isError: false });

    renderPage();

    expect(screen.queryByRole('button', { name: /add table/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no physical tables have been added yet/i)).toBeInTheDocument();
  });
});
