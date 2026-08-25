import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import OrgDashboardPage from './page';

const cafesMock = vi.fn();
vi.mock('@/hooks/org/use-org-cafes', () => ({
  useOrgCafes: () => cafesMock(),
}));

const assignMutateMock = vi.fn();
let assignHookState = { mutate: assignMutateMock, isPending: false, isSuccess: false };
vi.mock('@/hooks/org/use-assign-staff', () => ({
  useAssignStaff: () => assignHookState,
}));

const cafeStaffMock = vi.fn();
vi.mock('@/hooks/org/use-cafe-staff', () => ({
  useCafeStaff: (cafeId: string) => cafeStaffMock(cafeId),
}));

const removeStaffMutateMock = vi.fn();
let removeStaffHookState: { mutate: typeof removeStaffMutateMock; isPending: boolean; variables?: string } = {
  mutate: removeStaffMutateMock,
  isPending: false,
};
vi.mock('@/hooks/org/use-remove-staff', () => ({
  useRemoveStaff: () => removeStaffHookState,
}));

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'owner-1', name: 'Org Owner' } }),
}));

describe('OrgDashboardPage', () => {
  beforeEach(() => {
    assignMutateMock.mockReset();
    assignHookState = { mutate: assignMutateMock, isPending: false, isSuccess: false };
    cafeStaffMock.mockReset();
    cafeStaffMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    removeStaffMutateMock.mockReset();
    removeStaffHookState = { mutate: removeStaffMutateMock, isPending: false };
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

  // A "View dashboard" link buried in the title text (only discoverable by
  // hovering to notice a small arrow icon) wasn't obvious as an action --
  // an explicit button next to "Manage staff" is.
  test('shows an obvious "View dashboard" button next to Manage staff for each cafe', () => {
    cafesMock.mockReturnValue({
      data: [{ _id: 'cafe-1', name: 'Cafe One', slug: 'cafe-one', subscription_status: 'active', today_reservation_count: 0 }],
    });

    render(<OrgDashboardPage />);

    const viewDashboardLink = screen.getByRole('link', { name: /view dashboard/i });
    expect(viewDashboardLink).toHaveAttribute('href', '/cafe-one/dashboard');
    expect(screen.getByRole('button', { name: /manage staff/i })).toBeInTheDocument();
  });

  test('submits the add-staff form with email and role for the right cafe', async () => {
    cafesMock.mockReturnValue({
      data: [{ _id: 'cafe-1', name: 'Cafe One', slug: 'cafe-one', subscription_status: 'active', today_reservation_count: 0 }],
    });

    render(<OrgDashboardPage />);

    fireEvent.click(screen.getByRole('button', { name: /manage staff/i }));
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

  test('keeps the add-staff form input intact when the mutation has not succeeded', async () => {
    cafesMock.mockReturnValue({
      data: [{ _id: 'cafe-1', name: 'Cafe One', slug: 'cafe-one', subscription_status: 'active', today_reservation_count: 0 }],
    });

    render(<OrgDashboardPage />);

    fireEvent.click(screen.getByRole('button', { name: /manage staff/i }));
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'new-manager@example.com' } });
    fireEvent.change(screen.getByLabelText(/role/i), { target: { value: 'manager' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(assignMutateMock).toHaveBeenCalled());

    expect(screen.getByLabelText(/email/i)).toHaveValue('new-manager@example.com');
  });

  // The "Manage staff" panel stays open across a successful add so an
  // owner can assign several people in a row -- only the just-submitted
  // email field itself clears.
  test('clears the add-staff form but keeps the manage-staff panel open when the mutation succeeds', async () => {
    cafesMock.mockReturnValue({
      data: [{ _id: 'cafe-1', name: 'Cafe One', slug: 'cafe-one', subscription_status: 'active', today_reservation_count: 0 }],
    });

    const { rerender } = render(<OrgDashboardPage />);

    fireEvent.click(screen.getByRole('button', { name: /manage staff/i }));
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'new-manager@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(assignMutateMock).toHaveBeenCalled());

    assignHookState = { mutate: assignMutateMock, isPending: false, isSuccess: true };
    rerender(<OrgDashboardPage />);

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toHaveValue(''));
  });

  describe('staff list', () => {
    test('shows a loading state while staff are being fetched', () => {
      cafesMock.mockReturnValue({
        data: [{ _id: 'cafe-1', name: 'Cafe One', slug: 'cafe-one', subscription_status: 'active', today_reservation_count: 0 }],
      });
      cafeStaffMock.mockReturnValue({ data: [], isLoading: true, isError: false });

      render(<OrgDashboardPage />);
      fireEvent.click(screen.getByRole('button', { name: /manage staff/i }));

      expect(cafeStaffMock).toHaveBeenCalledWith('cafe-1');
    });

    test('shows an empty message when the cafe has no staff yet', () => {
      cafesMock.mockReturnValue({
        data: [{ _id: 'cafe-1', name: 'Cafe One', slug: 'cafe-one', subscription_status: 'active', today_reservation_count: 0 }],
      });
      cafeStaffMock.mockReturnValue({ data: [], isLoading: false, isError: false });

      render(<OrgDashboardPage />);
      fireEvent.click(screen.getByRole('button', { name: /manage staff/i }));

      expect(screen.getByText(/no staff assigned/i)).toBeInTheDocument();
    });

    test('lists each staff member with their name, email, and role', () => {
      cafesMock.mockReturnValue({
        data: [{ _id: 'cafe-1', name: 'Cafe One', slug: 'cafe-one', subscription_status: 'active', today_reservation_count: 0 }],
      });
      cafeStaffMock.mockReturnValue({
        data: [
          { user_id: 'owner-1', name: 'Org Owner', email: 'owner@test.com', role: 'owner' },
          { user_id: 'staff-2', name: 'Jane Manager', email: 'jane@test.com', role: 'manager' },
        ],
        isLoading: false,
        isError: false,
      });

      render(<OrgDashboardPage />);
      fireEvent.click(screen.getByRole('button', { name: /manage staff/i }));

      expect(screen.getByText('Jane Manager')).toBeInTheDocument();
      expect(screen.getByText('jane@test.com')).toBeInTheDocument();
      // "manager" also appears as an <option> in the add-staff role select
      // below, so scope this to the staff list item itself.
      const listItem = screen.getByText('Jane Manager').closest('li');
      expect(listItem).toHaveTextContent('manager');
    });

    // Matches the backend's own rule (deleteStaff rejects removing yourself)
    // -- surfacing that as a disabled/absent control beats letting the
    // owner click it and get an error toast.
    test('does not show a remove control for the signed-in owner\'s own row', () => {
      cafesMock.mockReturnValue({
        data: [{ _id: 'cafe-1', name: 'Cafe One', slug: 'cafe-one', subscription_status: 'active', today_reservation_count: 0 }],
      });
      cafeStaffMock.mockReturnValue({
        data: [{ user_id: 'owner-1', name: 'Org Owner', email: 'owner@test.com', role: 'owner' }],
        isLoading: false,
        isError: false,
      });

      render(<OrgDashboardPage />);
      fireEvent.click(screen.getByRole('button', { name: /manage staff/i }));

      expect(screen.queryByRole('button', { name: /remove org owner/i })).not.toBeInTheDocument();
    });

    test('removing a staff member calls the remove mutation with their user id', () => {
      cafesMock.mockReturnValue({
        data: [{ _id: 'cafe-1', name: 'Cafe One', slug: 'cafe-one', subscription_status: 'active', today_reservation_count: 0 }],
      });
      cafeStaffMock.mockReturnValue({
        data: [{ user_id: 'staff-2', name: 'Jane Manager', email: 'jane@test.com', role: 'manager' }],
        isLoading: false,
        isError: false,
      });

      render(<OrgDashboardPage />);
      fireEvent.click(screen.getByRole('button', { name: /manage staff/i }));
      fireEvent.click(screen.getByRole('button', { name: /remove jane manager/i }));

      expect(removeStaffMutateMock).toHaveBeenCalledWith('staff-2');
    });
  });
});
