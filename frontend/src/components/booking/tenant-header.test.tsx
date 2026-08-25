import React from 'react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TenantPublicHeader } from './tenant-header';

const mockUseAuth = vi.fn();
const logoutMock = vi.fn();

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/components/providers/tenant-provider', () => ({
  useTenant: () => ({
    cafe: { id: 'cafe_1', slug: 'demo-cafe', name: 'Demo Cafe', reservation_rules: {}, timezone: 'UTC' },
  }),
}));

vi.mock('@/components/auth/customer-auth-modal', () => ({
  CustomerAuthModal: ({ open }: { open: boolean }) => (open ? <div>auth modal open</div> : null),
}));

vi.mock('@/components/shared/email-verification-banner', () => ({
  EmailVerificationBanner: () => null,
}));

describe('TenantPublicHeader', () => {
  beforeEach(() => {
    logoutMock.mockReset();
  });

  test('opens the guest quick-auth modal from the account menu when signed out', () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false, logout: logoutMock });

    render(<TenantPublicHeader />);

    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /log in/i }));

    expect(screen.getByText('auth modal open')).toBeInTheDocument();
  });

  test('offers View Account and Log out when signed in', () => {
    mockUseAuth.mockReturnValue({
      user: { name: 'Priya Sharma', staff_memberships: [], owner_org_id: null, is_platform_admin: false },
      isAuthenticated: true,
      logout: logoutMock,
    });

    render(<TenantPublicHeader />);

    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));

    expect(screen.getByRole('menuitem', { name: /view account/i })).toHaveAttribute('href', '/profile');
    fireEvent.click(screen.getByRole('menuitem', { name: /log out/i }));
    expect(logoutMock).toHaveBeenCalled();
  });

  // A customer logging out from the storefront should stay on/return to
  // the storefront, not get sent to the staff login page.
  test('logging out redirects back to this cafe\'s storefront, not the staff login page', () => {
    mockUseAuth.mockReturnValue({
      user: { name: 'Priya Sharma', staff_memberships: [], owner_org_id: null, is_platform_admin: false },
      isAuthenticated: true,
      logout: logoutMock,
    });

    render(<TenantPublicHeader />);

    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /log out/i }));

    expect(logoutMock).toHaveBeenCalledWith('/demo-cafe');
  });

  describe('the shield quicklink beside the account menu', () => {
    test('links to /auth/login when signed out', () => {
      mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false, logout: logoutMock });

      render(<TenantPublicHeader />);

      expect(screen.getByTitle(/staff \/ operator login/i)).toHaveAttribute('href', '/auth/login');
    });

    // The bug: a signed-in customer clicked this and was sent to /auth/login
    // again, as if they weren't already authenticated.
    test('is not shown to a signed-in customer with no staff/org/admin role', () => {
      mockUseAuth.mockReturnValue({
        user: {
          name: 'Priya Sharma',
          staff_memberships: [],
          owner_org_id: null,
          is_platform_admin: false,
        },
        isAuthenticated: true,
        logout: logoutMock,
      });

      render(<TenantPublicHeader />);

      expect(screen.queryByTitle(/staff \/ operator login/i)).not.toBeInTheDocument();
      expect(screen.queryByText('/auth/login', { exact: false })).not.toBeInTheDocument();
    });

    test('links a signed-in staff member straight to their cafe dashboard', () => {
      mockUseAuth.mockReturnValue({
        user: {
          name: 'Sam Host',
          staff_memberships: [{ role: 'host', cafe_id: { slug: 'demo-cafe' } }],
          owner_org_id: null,
          is_platform_admin: false,
        },
        isAuthenticated: true,
        logout: logoutMock,
      });

      render(<TenantPublicHeader />);

      expect(screen.getByTitle(/staff dashboard/i)).toHaveAttribute('href', '/demo-cafe/dashboard');
    });

    test('links a signed-in org owner to the org dashboard', () => {
      mockUseAuth.mockReturnValue({
        user: {
          name: 'Org Owner',
          staff_memberships: [],
          owner_org_id: 'org_1',
          is_platform_admin: false,
        },
        isAuthenticated: true,
        logout: logoutMock,
      });

      render(<TenantPublicHeader />);

      expect(screen.getByTitle(/staff dashboard/i)).toHaveAttribute('href', '/org/dashboard');
    });
  });
});
