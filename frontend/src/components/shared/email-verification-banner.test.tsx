import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmailVerificationBanner } from './email-verification-banner';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));
vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({
    user: { email: 'unverified@example.com', is_email_verified: false },
    isAuthenticated: true,
    isLoading: false,
  }),
}));
vi.mock('@/hooks/auth/use-resend-verification-email', () => ({
  useResendVerificationEmail: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('EmailVerificationBanner', () => {
  test('uses the supplied sticky placement classes', () => {
    render(<EmailVerificationBanner className="sticky top-16 z-40" />);

    expect(screen.getByRole('alert')).toHaveClass('sticky', 'top-16', 'z-40');
  });
});
