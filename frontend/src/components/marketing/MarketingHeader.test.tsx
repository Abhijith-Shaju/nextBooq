import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MarketingHeader from './MarketingHeader';

const mockUsePathname = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('MarketingHeader', () => {
  test('shows About and Contact anchors on the home page', () => {
    mockUsePathname.mockReturnValue('/');
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false, logout: vi.fn() });

    render(<MarketingHeader />);

    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/#about');
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/#contact');
  });

  test('hides section navigation away from the home page', () => {
    mockUsePathname.mockReturnValue('/auth/login');
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false, logout: vi.fn() });

    render(<MarketingHeader />);

    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
  });

  test('links the logo to the home page', () => {
    mockUsePathname.mockReturnValue('/');
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false, logout: vi.fn() });

    render(<MarketingHeader />);

    expect(screen.getByRole('link', { name: 'nextBooq home' })).toHaveAttribute('href', '/');
  });
});
