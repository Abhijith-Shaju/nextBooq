import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CafeOnboardingForm } from './cafe-onboarding-form';

const owner = {
  id: 'owner-1',
  name: 'Asha Owner',
  email: 'asha@example.com',
  staff_memberships: [],
  owned_organizations: [{ id: 'org-1', name: 'Existing Group' }],
};

const provisionedCafe = {
  owner: { id: 'owner-1', name: 'Asha Owner', email: 'asha@example.com' },
  organization: { id: 'org-2', name: 'New Group' },
  cafe: { id: 'cafe-1', name: 'Garden Cafe', slug: 'garden-cafe', timezone: 'Asia/Kolkata' },
  subscription: {
    id: 'subscription-1',
    status: 'trial' as const,
    term_months: 1 as const,
    price_per_month: 0,
    period_start: '2026-08-15T00:00:00.000Z',
    current_period_end: '2026-09-15T00:00:00.000Z',
    is_current: true,
  },
};

let lookupState: any;
let provisionState: any;

vi.mock('@/hooks/admin/use-owner-lookup', () => ({
  useOwnerLookup: () => lookupState,
}));

vi.mock('@/hooks/admin/use-provision-cafe', () => ({
  useProvisionCafe: () => provisionState,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

const goToSubscription = async () => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Owner email'), 'asha@example.com');
  await user.click(screen.getByRole('button', { name: 'Find owner' }));
  await screen.findByText('Owner found: Asha Owner (asha@example.com)');
  await user.click(screen.getByRole('button', { name: 'Continue' }));

  await user.type(screen.getByLabelText('Organization name'), 'New Group');
  await user.click(screen.getByRole('button', { name: 'Continue' }));

  await user.type(screen.getByLabelText('Cafe name'), 'Garden Cafe');
  await user.type(screen.getByLabelText('Cafe slug'), 'garden-cafe');
  await user.click(screen.getByRole('button', { name: 'Continue' }));

  return user;
};

const goToReview = async () => {
  const user = await goToSubscription();
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  return user;
};

describe('CafeOnboardingForm', () => {
  beforeEach(() => {
    lookupState = { data: owner, isFetching: false, isError: false, error: null };
    provisionState = { isPending: false, isError: false, error: null, mutate: vi.fn() };
  });

  test('keeps cafe provisioning behind five sequential steps', async () => {
    const user = userEvent.setup();
    render(<CafeOnboardingForm />);

    expect(screen.getByRole('heading', { name: '1. Find owner' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '2. Organization' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm and onboard cafe' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Owner email'), 'asha@example.com');
    await user.click(screen.getByRole('button', { name: 'Find owner' }));
    await screen.findByText('Owner found: Asha Owner (asha@example.com)');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: '2. Organization' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: '1. Find owner' })).toBeInTheDocument();
  });

  test('shows owner lookup failure after the admin requests a lookup', async () => {
    lookupState = { data: null, isFetching: false, isError: true, error: new Error('Owner not found') };
    const user = userEvent.setup();
    render(<CafeOnboardingForm />);

    await user.type(screen.getByLabelText('Owner email'), 'missing@example.com');
    await user.click(screen.getByRole('button', { name: 'Find owner' }));

    expect(await screen.findByText(/owner not found/i)).toBeInTheDocument();
    expect(screen.getByText(/ask the person to register/i)).toBeInTheDocument();
  });

  test('shows a duplicate-slug error on the final review step', async () => {
    provisionState = { isPending: false, isError: true, error: new Error('Cafe slug already exists'), mutate: vi.fn() };
    render(<CafeOnboardingForm />);

    await goToReview();

    expect(screen.getByRole('heading', { name: '5. Review' })).toBeInTheDocument();
    expect(screen.getByText('Cafe slug already exists')).toBeInTheDocument();
  });

  test('disables final submission while provisioning is pending', async () => {
    provisionState = { isPending: true, isError: false, error: null, mutate: vi.fn() };
    render(<CafeOnboardingForm />);

    await goToReview();

    expect(screen.getByRole('button', { name: 'Provisioning…' })).toBeDisabled();
  });

  test('shows a detailed trial success summary and resets without a dashboard action', async () => {
    provisionState = {
      isPending: false,
      isError: false,
      error: null,
      mutate: vi.fn((_payload: unknown, callbacks: { onSuccess: (result: typeof provisionedCafe) => void }) => callbacks.onSuccess(provisionedCafe)),
    };
    render(<CafeOnboardingForm />);

    const user = await goToSubscription();
    await user.click(screen.getByLabelText('One-month trial at ₹0'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Confirm and onboard cafe' }));

    await waitFor(() => expect(screen.getByText('Cafe onboarded successfully')).toBeInTheDocument());
    expect(screen.getByText('Asha Owner · asha@example.com')).toBeInTheDocument();
    expect(screen.getByText('New Group')).toBeInTheDocument();
    expect(screen.getByText('/garden-cafe')).toBeInTheDocument();
    expect(screen.getByText(/one-month trial at ₹0/i)).toBeInTheDocument();
    expect(screen.getByText('Aug 15, 2026')).toBeInTheDocument();
    expect(screen.getByText('Sep 15, 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Cafe Page' })).toHaveAttribute('href', '/garden-cafe');
    expect(screen.getByRole('link', { name: 'View in Admin' })).toHaveAttribute('href', '/admin?cafeId=cafe-1');
    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Onboard Another' }));
    expect(screen.getByRole('heading', { name: '1. Find owner' })).toBeInTheDocument();
    expect(screen.getByLabelText('Owner email')).toHaveValue('');
  });
});
