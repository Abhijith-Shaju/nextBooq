import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AccountMenu } from './account-menu';

const logoutMock = vi.fn();
const useAuthMock = vi.fn();
vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => useAuthMock(),
}));

describe('AccountMenu', () => {
  beforeEach(() => {
    logoutMock.mockReset();
  });

  test('shows only a "Log in" item when signed out', () => {
    useAuthMock.mockReturnValue({ user: null, isAuthenticated: false, logout: logoutMock });

    render(<AccountMenu />);
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));

    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('Log in');
    expect(items[0]).toHaveAttribute('href', '/auth/login');
  });

  test('calls onLoginClick instead of linking when provided and signed out', () => {
    useAuthMock.mockReturnValue({ user: null, isAuthenticated: false, logout: logoutMock });
    const onLoginClick = vi.fn();

    render(<AccountMenu onLoginClick={onLoginClick} />);
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /log in/i }));

    expect(onLoginClick).toHaveBeenCalled();
  });

  test('shows "View Account" and "Log out" when signed in', () => {
    useAuthMock.mockReturnValue({
      user: { name: 'Priya Sharma', email: 'priya@test.com' },
      isAuthenticated: true,
      logout: logoutMock,
    });

    render(<AccountMenu />);
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));

    const viewAccount = screen.getByRole('menuitem', { name: /view account/i });
    expect(viewAccount).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('menuitem', { name: /log out/i })).toBeInTheDocument();
  });

  test('clicking Log out calls logout and closes the menu', () => {
    useAuthMock.mockReturnValue({
      user: { name: 'Priya Sharma', email: 'priya@test.com' },
      isAuthenticated: true,
      logout: logoutMock,
    });

    render(<AccountMenu />);
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /log out/i }));

    expect(logoutMock).toHaveBeenCalledWith(undefined);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  // A customer logging out from a cafe's storefront should land back on
  // that storefront, not the staff/admin login page -- callers that know
  // they're in a tenant context (e.g. TenantPublicHeader) pass this through.
  test('passes logoutRedirectTo through to logout when provided', () => {
    useAuthMock.mockReturnValue({
      user: { name: 'Priya Sharma', email: 'priya@test.com' },
      isAuthenticated: true,
      logout: logoutMock,
    });

    render(<AccountMenu logoutRedirectTo="/demo-cafe" />);
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /log out/i }));

    expect(logoutMock).toHaveBeenCalledWith('/demo-cafe');
  });

  test('closes when clicking outside the menu', () => {
    useAuthMock.mockReturnValue({
      user: { name: 'Priya Sharma', email: 'priya@test.com' },
      isAuthenticated: true,
      logout: logoutMock,
    });

    render(
      <div>
        <AccountMenu />
        <button type="button">outside</button>
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('button', { name: /outside/i }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('closes on Escape', () => {
    useAuthMock.mockReturnValue({
      user: { name: 'Priya Sharma', email: 'priya@test.com' },
      isAuthenticated: true,
      logout: logoutMock,
    });

    render(<AccountMenu />);
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
