import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import OrgDashboardLayout from './layout';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/org/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/components/shared/email-verification-banner', () => ({
  EmailVerificationBanner: () => null,
}));

const useAuthMock = vi.fn();
vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => useAuthMock(),
}));

describe('OrgDashboardLayout', () => {
  beforeEach(() => {
    replaceMock.mockReset();
  });

  test('redirects a non-owner user home instead of into a login loop', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', name: 'Regular', owner_org_id: null },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<OrgDashboardLayout>{'child content'}</OrgDashboardLayout>);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
  });

  test('redirects to login when there is no authenticated user at all', async () => {
    useAuthMock.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false });

    render(<OrgDashboardLayout>{'child content'}</OrgDashboardLayout>);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/auth/login?callbackUrl=%2Forg%2Fdashboard'));
  });

  test('renders children without redirecting for an org owner', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', name: 'Owner', owner_org_id: 'org-1' },
      isAuthenticated: true,
      isLoading: false,
    });

    const { findByText } = render(<OrgDashboardLayout>{'child content'}</OrgDashboardLayout>);

    await findByText('child content');
    expect(replaceMock).not.toHaveBeenCalled();
  });

  test('renders nothing while auth is still loading', () => {
    useAuthMock.mockReturnValue({ user: null, isAuthenticated: false, isLoading: true });

    const { queryByText } = render(<OrgDashboardLayout>{'child content'}</OrgDashboardLayout>);

    expect(queryByText('child content')).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
