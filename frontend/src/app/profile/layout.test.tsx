import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import ProfileLayout from './layout';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/profile',
  useSearchParams: () => new URLSearchParams(),
}));

const logoutMock = vi.fn();
const useAuthMock = vi.fn();
vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => useAuthMock(),
}));

describe('ProfileLayout', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    logoutMock.mockReset();
  });

  test('redirects to login when there is no authenticated user', async () => {
    useAuthMock.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false, logout: logoutMock });

    render(<ProfileLayout>{'child content'}</ProfileLayout>);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/auth/login?callbackUrl=%2Fprofile'));
  });

  test('renders nothing while auth is still loading', () => {
    useAuthMock.mockReturnValue({ user: null, isAuthenticated: false, isLoading: true, logout: logoutMock });

    const { queryByText } = render(<ProfileLayout>{'child content'}</ProfileLayout>);

    expect(queryByText('child content')).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  test('renders children and no Workspace section for a guest user', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', name: 'Regular User', email: 'regular@test.com', staff_memberships: [], owner_org_id: null },
      isAuthenticated: true,
      isLoading: false,
      logout: logoutMock,
    });

    render(<ProfileLayout>{'child content'}</ProfileLayout>);

    await screen.findByText('child content');
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument();
  });

  test('shows a real Org Dashboard link for an org owner', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', name: 'Owner', email: 'owner@test.com', staff_memberships: [], owner_org_id: 'org-1' },
      isAuthenticated: true,
      isLoading: false,
      logout: logoutMock,
    });

    render(<ProfileLayout>{'child content'}</ProfileLayout>);

    const link = await screen.findByRole('link', { name: /org dashboard/i });
    expect(link).toHaveAttribute('href', '/org/dashboard');
  });

  test('shows a real per-cafe dashboard link for each cafe a manager is assigned to', async () => {
    useAuthMock.mockReturnValue({
      user: {
        id: 'u1',
        name: 'Manager',
        email: 'manager@test.com',
        owner_org_id: null,
        staff_memberships: [
          { cafe_id: { name: 'Cafe One', slug: 'cafe-one' }, role: 'manager', permissions: [] },
        ],
      },
      isAuthenticated: true,
      isLoading: false,
      logout: logoutMock,
    });

    render(<ProfileLayout>{'child content'}</ProfileLayout>);

    const link = await screen.findByRole('link', { name: /cafe one/i });
    expect(link).toHaveAttribute('href', '/cafe-one/dashboard');
  });

  test('collapses the Account nav when its header is clicked', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', name: 'Regular User', email: 'regular@test.com', staff_memberships: [], owner_org_id: null },
      isAuthenticated: true,
      isLoading: false,
      logout: logoutMock,
    });

    render(<ProfileLayout>{'child content'}</ProfileLayout>);

    await screen.findByText('child content');
    expect(screen.getByRole('link', { name: /^profile$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /account/i }));

    expect(screen.queryByRole('link', { name: /^profile$/i })).not.toBeInTheDocument();
  });

  test('calls logout when Sign out is clicked', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', name: 'Regular User', email: 'regular@test.com', staff_memberships: [], owner_org_id: null },
      isAuthenticated: true,
      isLoading: false,
      logout: logoutMock,
    });

    render(<ProfileLayout>{'child content'}</ProfileLayout>);

    fireEvent.click(await screen.findByRole('button', { name: /sign out/i }));

    expect(logoutMock).toHaveBeenCalled();
  });
});
