import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import ReservationsHistoryPage from './page';

vi.mock('@/components/providers/tenant-provider', () => ({
  useTenant: () => ({ cafe: { id: 'cafe_1', slug: 'demo-cafe' } }),
}));

const mockUseManifest = vi.fn();
vi.mock('@/hooks/host/use-manifest', () => ({
  useManifest: (...args: unknown[]) => mockUseManifest(...args),
}));

describe('ReservationsHistoryPage error vs. empty state', () => {
  test('shows a distinct error message when the fetch fails, not the empty-state message', () => {
    mockUseManifest.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    render(<ReservationsHistoryPage />);

    expect(screen.getByText(/couldn.t load/i)).toBeInTheDocument();
    expect(screen.queryByText(/no reservations matched/i)).not.toBeInTheDocument();
  });

  test('shows the empty-state message when the fetch succeeds with zero results', () => {
    mockUseManifest.mockReturnValue({ data: [], isLoading: false, isError: false });

    render(<ReservationsHistoryPage />);

    expect(screen.getByText(/no reservations matched/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn.t load/i)).not.toBeInTheDocument();
  });
});
