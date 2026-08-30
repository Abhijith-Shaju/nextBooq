import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CafeApplicationCard } from './cafe-application-card';
import { useWithdrawCafeApplication } from '@/hooks/onboarding/use-withdraw-cafe-application';

vi.mock('@/hooks/onboarding/use-withdraw-cafe-application', () => ({
  useWithdrawCafeApplication: vi.fn(),
}));

const withdrawMutate = vi.fn();

const guest = { staff_memberships: [], owner_org_id: null } as any;
const owner = { staff_memberships: [], owner_org_id: 'org_1' } as any;

const pendingApplication = {
  id: 'app1',
  application_ref: 'CAFE-0001',
  status: 'pending',
  cafe_slug: 'filter-kaapi',
  cafe_name: 'Filter Kaapi',
  created_at: '2026-08-01T00:00:00.000Z',
  review_note: '',
} as any;

const rejectedApplication = {
  ...pendingApplication,
  status: 'rejected',
  review_note: 'Duplicate registration.',
} as any;

describe('CafeApplicationCard', () => {
  beforeEach(() => {
    withdrawMutate.mockClear();
    vi.mocked(useWithdrawCafeApplication).mockReturnValue({
      mutate: withdrawMutate,
      isPending: false,
      isError: false,
      error: null,
    } as any);
  });

  test('apply state links to /onboarding/cafe', () => {
    render(<CafeApplicationCard user={guest} application={null} />);

    const link = screen.getByRole('link', { name: /register your cafe/i });
    expect(link).toHaveAttribute('href', '/onboarding/cafe');
  });

  test('pending state shows the application reference and a withdraw button', async () => {
    render(<CafeApplicationCard user={guest} application={pendingApplication} />);

    expect(screen.getByText('CAFE-0001')).toBeInTheDocument();
    expect(screen.getByText('Filter Kaapi')).toBeInTheDocument();

    const withdrawButton = screen.getByRole('button', { name: /withdraw application/i });
    expect(withdrawButton).toBeInTheDocument();

    await userEvent.click(withdrawButton);
    expect(withdrawMutate).toHaveBeenCalled();
  });

  test('rejected state shows the review note and a re-apply link', () => {
    render(<CafeApplicationCard user={guest} application={rejectedApplication} />);

    expect(screen.getByText('Duplicate registration.')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /update and apply again/i });
    expect(link).toHaveAttribute('href', '/onboarding/cafe');
  });

  test('renders nothing for a hidden state (org owner)', () => {
    const { container } = render(<CafeApplicationCard user={owner} application={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
