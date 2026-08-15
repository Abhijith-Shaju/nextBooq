import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import OrgDashboardPage from './page';

const cafesMock = vi.fn();
vi.mock('@/hooks/org/use-org-cafes', () => ({
  useOrgCafes: () => cafesMock(),
}));

const assignMutateMock = vi.fn();
vi.mock('@/hooks/org/use-assign-staff', () => ({
  useAssignStaff: () => ({ mutate: assignMutateMock, isPending: false }),
}));

describe('OrgDashboardPage', () => {
  beforeEach(() => {
    assignMutateMock.mockReset();
  });

  test('lists every cafe with its subscription status and reservation count', () => {
    cafesMock.mockReturnValue({
      data: [
        { _id: 'cafe-1', name: 'Cafe One', slug: 'cafe-one', subscription_status: 'active', today_reservation_count: 3 },
        { _id: 'cafe-2', name: 'Cafe Two', slug: 'cafe-two', subscription_status: 'trial', today_reservation_count: 0 },
      ],
    });

    render(<OrgDashboardPage />);

    expect(screen.getByText('Cafe One')).toBeInTheDocument();
    expect(screen.getByText('Cafe Two')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('trial')).toBeInTheDocument();
  });

  test('links each cafe card to its tenant dashboard', () => {
    cafesMock.mockReturnValue({
      data: [{ _id: 'cafe-1', name: 'Cafe One', slug: 'cafe-one', subscription_status: 'active', today_reservation_count: 0 }],
    });

    render(<OrgDashboardPage />);

    const link = screen.getByRole('link', { name: /Cafe One/i });
    expect(link).toHaveAttribute('href', '/cafe-one/dashboard');
  });

  test('submits the assign-staff form with email and role for the right cafe', async () => {
    cafesMock.mockReturnValue({
      data: [{ _id: 'cafe-1', name: 'Cafe One', slug: 'cafe-one', subscription_status: 'active', today_reservation_count: 0 }],
    });

    render(<OrgDashboardPage />);

    fireEvent.click(screen.getByRole('button', { name: /assign staff/i }));
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'new-manager@example.com' } });
    fireEvent.change(screen.getByLabelText(/role/i), { target: { value: 'manager' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(assignMutateMock).toHaveBeenCalledWith({ email: 'new-manager@example.com', role: 'manager' })
    );
  });

  test('shows an empty state when the org has no cafes', () => {
    cafesMock.mockReturnValue({ data: [] });

    render(<OrgDashboardPage />);

    expect(screen.getByText(/no cafes/i)).toBeInTheDocument();
  });
});
