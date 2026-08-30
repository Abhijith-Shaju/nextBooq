import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import OnboardingStatusPage from './page';
import { useMyCafeApplication } from '@/hooks/onboarding/use-my-cafe-application';
import { useWithdrawCafeApplication } from '@/hooks/onboarding/use-withdraw-cafe-application';

const push = vi.fn();
const replace = vi.fn();
const withdrawMutate = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'owner@filterkaapi.example', name: 'Owner' } }),
}));

vi.mock('@/hooks/onboarding/use-my-cafe-application', () => ({
  useMyCafeApplication: vi.fn(),
}));

vi.mock('@/hooks/onboarding/use-withdraw-cafe-application', () => ({
  useWithdrawCafeApplication: vi.fn(),
}));

const baseApplication = {
  id: 'app1',
  application_ref: 'CAFE-0001',
  cafe_slug: 'filter-kaapi',
  cafe_name: 'Filter Kaapi',
  created_at: '2026-08-01T00:00:00.000Z',
  review_note: '',
};

describe('OnboardingStatusPage', () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    withdrawMutate.mockClear();
    vi.mocked(useWithdrawCafeApplication).mockReturnValue({
      mutate: withdrawMutate,
      isPending: false,
      isError: false,
      error: null,
    } as any);
  });

  test('shows a spinner and does not redirect while the query is loading', () => {
    vi.mocked(useMyCafeApplication).mockReturnValue({ data: undefined, isLoading: true } as any);

    render(<OnboardingStatusPage />);

    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText(/application received/i)).not.toBeInTheDocument();
  });

  test('redirects to /onboarding/cafe when there is no application', () => {
    vi.mocked(useMyCafeApplication).mockReturnValue({ data: null, isLoading: false } as any);

    render(<OnboardingStatusPage />);

    expect(replace).toHaveBeenCalledWith('/onboarding/cafe');
  });

  test('redirects to /onboarding/cafe when the application was withdrawn', () => {
    vi.mocked(useMyCafeApplication).mockReturnValue({
      data: { ...baseApplication, status: 'withdrawn' },
      isLoading: false,
    } as any);

    render(<OnboardingStatusPage />);

    expect(replace).toHaveBeenCalledWith('/onboarding/cafe');
    expect(screen.queryByText(/application received/i)).not.toBeInTheDocument();
  });

  test('pending application shows the reference, cafe name and a withdraw button', () => {
    vi.mocked(useMyCafeApplication).mockReturnValue({
      data: { ...baseApplication, status: 'pending' },
      isLoading: false,
    } as any);

    render(<OnboardingStatusPage />);

    expect(screen.getByText('CAFE-0001')).toBeInTheDocument();
    expect(screen.getByText('Filter Kaapi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /withdraw application/i })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  test('approved application links to the cafe dashboard', () => {
    vi.mocked(useMyCafeApplication).mockReturnValue({
      data: { ...baseApplication, status: 'approved' },
      isLoading: false,
    } as any);

    render(<OnboardingStatusPage />);

    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute(
      'href',
      '/filter-kaapi/dashboard'
    );
  });

  test('rejected application shows the review note and links back to the wizard', () => {
    vi.mocked(useMyCafeApplication).mockReturnValue({
      data: { ...baseApplication, status: 'rejected', review_note: 'Duplicate registration.' },
      isLoading: false,
    } as any);

    render(<OnboardingStatusPage />);

    expect(screen.getByText('Duplicate registration.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /new application/i })).toHaveAttribute(
      'href',
      '/onboarding/cafe'
    );
  });

  test('clicking withdraw calls the withdraw mutation', async () => {
    vi.mocked(useMyCafeApplication).mockReturnValue({
      data: { ...baseApplication, status: 'pending' },
      isLoading: false,
    } as any);

    render(<OnboardingStatusPage />);
    await userEvent.click(screen.getByRole('button', { name: /withdraw application/i }));

    expect(withdrawMutate).toHaveBeenCalled();
  });
});
