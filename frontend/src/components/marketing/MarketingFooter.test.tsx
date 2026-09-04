import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MarketingFooter from './MarketingFooter';

const mockUseAuth = vi.fn();

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('MarketingFooter', () => {
  test('shows the registration link for a signed-out visitor', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });

    render(<MarketingFooter />);

    expect(screen.getByRole('link', { name: 'Get a demo' })).toHaveAttribute(
      'href',
      '/auth/register'
    );
  });

  test('hides the demo link for an authenticated user', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });

    render(<MarketingFooter />);

    expect(screen.queryByRole('link', { name: 'Get a demo' })).not.toBeInTheDocument();
  });

  test('shows "Log in" for a signed-out visitor', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });

    render(<MarketingFooter />);

    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/auth/login');
  });

  test('replaces "Log in" with "View Account" for a signed-in user', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });

    render(<MarketingFooter />);

    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Account' })).toHaveAttribute('href', '/profile');
  });

  test('hides the demo link until the session check completes', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });

    render(<MarketingFooter />);

    expect(screen.queryByRole('link', { name: 'Get a demo' })).not.toBeInTheDocument();
  });
});

describe('MarketingFooter legal and contact links', () => {
  // These have to be real routes, not the landing page's /#contact anchor:
  // the E-Commerce Rules 2020 expect them published, and a payment aggregator
  // will fetch the URLs during onboarding. An anchor 404s when linked directly.
  test.each([
    ['Terms & Conditions', '/legal/terms'],
    ['Privacy Policy', '/legal/privacy'],
    ['Cancellation & Refunds', '/legal/refunds'],
    ['Contact', '/contact'],
  ])('links %s to %s', (name, href) => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });

    render(<MarketingFooter />);

    expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
  });
});
