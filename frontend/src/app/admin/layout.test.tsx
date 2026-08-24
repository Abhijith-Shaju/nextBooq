import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import AdminLayout from './layout';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const useAuthMock = vi.fn();
vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/components/shared/email-verification-banner', () => ({
  EmailVerificationBanner: () => null,
}));

describe('AdminLayout', () => {
  beforeEach(() => {
    replaceMock.mockReset();
  });

  test('redirects a non-admin user home instead of into a login loop', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', name: 'Regular', is_platform_admin: false },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<AdminLayout>{'child content'}</AdminLayout>);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
  });

  test('redirects to login when there is no authenticated user at all', async () => {
    useAuthMock.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false });

    render(<AdminLayout>{'child content'}</AdminLayout>);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/auth/login?callbackUrl=%2Fadmin'));
  });

  test('renders children without redirecting for a platform admin', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', name: 'Admin', is_platform_admin: true },
      isAuthenticated: true,
      isLoading: false,
    });

    const { findByText } = render(<AdminLayout>{'child content'}</AdminLayout>);

    await findByText('child content');
    expect(replaceMock).not.toHaveBeenCalled();
  });

  test('renders nothing while auth is still loading', () => {
    useAuthMock.mockReturnValue({ user: null, isAuthenticated: false, isLoading: true });

    const { queryByText } = render(<AdminLayout>{'child content'}</AdminLayout>);

    expect(queryByText('child content')).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
