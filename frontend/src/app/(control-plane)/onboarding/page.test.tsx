import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import OnboardingPage from './page';

const push = vi.fn();
const mutate = vi.fn();
let searchParamsMock = new URLSearchParams('');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => searchParamsMock,
}));

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'u1', account_type: null, cafe_application: null, staff_memberships: [], owner_org_id: null, is_platform_admin: false, is_email_verified: true, email: 'a@b.com', name: 'A' } }),
}));

vi.mock('@/hooks/auth/use-update-account-type', () => ({
  useUpdateAccountType: () => ({ mutate, isPending: false }),
}));

describe('OnboardingPage', () => {
  beforeEach(() => {
    push.mockClear();
    mutate.mockClear();
    searchParamsMock = new URLSearchParams('');
  });

  test('offers both roles', () => {
    render(<OnboardingPage />);
    expect(screen.getByRole('button', { name: /booking a table/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run a cafe/i })).toBeInTheDocument();
  });

  test('choosing customer records the account type', async () => {
    render(<OnboardingPage />);
    await userEvent.click(screen.getByRole('button', { name: /booking a table/i }));
    expect(mutate).toHaveBeenCalledWith(
      { account_type: 'customer' },
      expect.anything()
    );
  });

  test('choosing cafe owner records the account type', async () => {
    render(<OnboardingPage />);
    await userEvent.click(screen.getByRole('button', { name: /run a cafe/i }));
    expect(mutate).toHaveBeenCalledWith(
      { account_type: 'cafe_owner' },
      expect.anything()
    );
  });

  // Open-redirect regression coverage: a leading "/\" is not caught by a
  // naive "starts with a single slash" check, but browsers' URL parser
  // treats a backslash right after a leading slash the same as a second
  // slash for http/https — i.e. "/\evil.com" resolves to host evil.com.
  test('never navigates to a backslash-prefixed callbackUrl (open-redirect bypass)', async () => {
    searchParamsMock = new URLSearchParams({ callbackUrl: '/\\evil.com' });
    mutate.mockImplementation((_payload, { onSuccess }) => onSuccess());

    render(<OnboardingPage />);
    await userEvent.click(screen.getByRole('button', { name: /booking a table/i }));

    expect(push).toHaveBeenCalledWith('/');
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining('evil.com'));
  });

  test('never navigates to a protocol-relative callbackUrl (open-redirect bypass)', async () => {
    searchParamsMock = new URLSearchParams({ callbackUrl: '//evil.com' });
    mutate.mockImplementation((_payload, { onSuccess }) => onSuccess());

    render(<OnboardingPage />);
    await userEvent.click(screen.getByRole('button', { name: /booking a table/i }));

    expect(push).toHaveBeenCalledWith('/');
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining('evil.com'));
  });
});
