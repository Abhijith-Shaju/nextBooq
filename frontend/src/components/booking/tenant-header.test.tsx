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
      user: { name: 'Priya Sharma' },
      isAuthenticated: true,
      logout: logoutMock,
    });

    render(<TenantPublicHeader />);

    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));

    expect(screen.getByRole('menuitem', { name: /view account/i })).toHaveAttribute('href', '/profile');
    fireEvent.click(screen.getByRole('menuitem', { name: /log out/i }));
    expect(logoutMock).toHaveBeenCalled();
  });
});
