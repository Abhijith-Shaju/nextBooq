import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { EmailVerificationBanner } from './email-verification-banner';

let mockAuth: { user: any; isAuthenticated: boolean; isLoading: boolean };
let mockPathname = '/demo-cafe';
const resendMutate = vi.fn();

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('@/hooks/auth/use-resend-verification-email', () => ({
  useResendVerificationEmail: () => ({ mutate: resendMutate, isPending: false }),
}));

describe('EmailVerificationBanner', () => {
  beforeEach(() => {
    resendMutate.mockReset();
    mockPathname = '/demo-cafe';
    mockAuth = {
      user: { email: 'guest@example.com', is_email_verified: false },
      isAuthenticated: true,
      isLoading: false,
    };
  });

  test('renders nothing while auth is still loading', () => {
    mockAuth = { user: null, isAuthenticated: false, isLoading: true };
    const { container } = render(<EmailVerificationBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing for a signed-out visitor', () => {
    mockAuth = { user: null, isAuthenticated: false, isLoading: false };
    const { container } = render(<EmailVerificationBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing once the user is already verified', () => {
    mockAuth = { user: { email: 'a@b.com', is_email_verified: true }, isAuthenticated: true, isLoading: false };
    const { container } = render(<EmailVerificationBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing on an auth-flow route', () => {
    mockPathname = '/auth/verify-email';
    const { container } = render(<EmailVerificationBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  test('shows the reminder with the user email for an unverified signed-in user', () => {
    render(<EmailVerificationBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent('guest@example.com');
    expect(screen.getByRole('link', { name: /verify now/i })).toHaveAttribute(
      'href',
      `/auth/verify-email?callbackUrl=${encodeURIComponent('/demo-cafe')}`
    );
  });

  test('triggers a resend when "Resend code" is clicked', () => {
    resendMutate.mockImplementation((_payload, { onSuccess }: any) => onSuccess());
    render(<EmailVerificationBanner />);

    fireEvent.click(screen.getByRole('button', { name: /resend code/i }));
    expect(resendMutate).toHaveBeenCalled();
  });

  test('hides the banner for the session when dismissed', () => {
    render(<EmailVerificationBanner />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
