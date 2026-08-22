import React from 'react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MarketingHeader from './MarketingHeader';

const mockUseAuth = vi.fn();
const logoutMock = vi.fn();

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('MarketingHeader', () => {
  beforeEach(() => {
    logoutMock.mockReset();
  });

  test('shows an account menu offering only Log in for a signed-out visitor', () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false, logout: logoutMock });

    render(<MarketingHeader />);

    const [desktopAccountButton] = screen.getAllByRole('button', { name: /account menu/i });
    fireEvent.click(desktopAccountButton);

    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('Log in');
    expect(screen.getByRole('link', { name: 'Get Started' })).toBeInTheDocument();
  });

  test('shows View Account and Log out for a signed-in visitor with no dashboard access', () => {
    mockUseAuth.mockReturnValue({
      user: { name: 'Regular User', staff_memberships: [], owner_org_id: null, is_platform_admin: false },
      isAuthenticated: true,
      logout: logoutMock,
    });

    render(<MarketingHeader />);

    const [desktopAccountButton] = screen.getAllByRole('button', { name: /account menu/i });
    fireEvent.click(desktopAccountButton);

    expect(screen.getByRole('menuitem', { name: /view account/i })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('menuitem', { name: /log out/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Get Started' })).not.toBeInTheDocument();
  });
});
