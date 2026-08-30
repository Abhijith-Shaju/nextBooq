import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CafeApplicationWizard } from './cafe-application-wizard';

const mutate = vi.fn();
const push = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/hooks/onboarding/use-submit-cafe-application', () => ({
  useSubmitCafeApplication: () => ({ mutate, isPending: false }),
}));

const fill = async (label: RegExp, value: string) => {
  await userEvent.type(screen.getByLabelText(label), value);
};

const advance = async () => userEvent.click(screen.getByRole('button', { name: /continue/i }));

describe('CafeApplicationWizard', () => {
  beforeEach(() => { mutate.mockClear(); push.mockClear(); });

  test('cannot continue past step 1 without an organization name', async () => {
    render(<CafeApplicationWizard />);
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    await fill(/organization name/i, 'Filter Kaapi Co');
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });

  test('cannot continue past step 2 without a name, slug and timezone', async () => {
    render(<CafeApplicationWizard />);
    await fill(/organization name/i, 'Filter Kaapi Co');
    await advance();

    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    await fill(/cafe name/i, 'Filter Kaapi');
    await fill(/cafe address on nextbooq/i, 'filter-kaapi');
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });

  test('rejects a PIN with a leading zero before submitting', async () => {
    render(<CafeApplicationWizard />);
    await fill(/organization name/i, 'Filter Kaapi Co');
    await advance();
    await fill(/cafe name/i, 'Filter Kaapi');
    await fill(/cafe address on nextbooq/i, 'filter-kaapi');
    await advance();
    await fill(/address line 1/i, '12 Church Street');
    await fill(/city/i, 'Bengaluru');
    await fill(/state/i, 'Karnataka');
    await fill(/pin code/i, '060001');

    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    expect(screen.getByText(/6-digit/i)).toBeInTheDocument();
  });

  test('submits the full payload from the review step', async () => {
    render(<CafeApplicationWizard />);
    await fill(/organization name/i, 'Filter Kaapi Co');
    await advance();
    await fill(/cafe name/i, 'Filter Kaapi');
    await fill(/cafe address on nextbooq/i, 'filter-kaapi');
    await advance();
    await fill(/address line 1/i, '12 Church Street');
    await fill(/city/i, 'Bengaluru');
    await fill(/state/i, 'Karnataka');
    await fill(/pin code/i, '560001');
    await advance();

    await userEvent.click(screen.getByRole('button', { name: /submit application/i }));

    expect(mutate).toHaveBeenCalledWith(
      {
        organization_name: 'Filter Kaapi Co',
        cafe_name: 'Filter Kaapi',
        cafe_slug: 'filter-kaapi',
        timezone: 'Asia/Kolkata',
        address: {
          line1: '12 Church Street',
          line2: '',
          landmark: '',
          city: 'Bengaluru',
          state: 'Karnataka',
          postal_code: '560001',
          map_url: '',
        },
      },
      expect.anything()
    );
  });

  test('going back preserves what was already entered', async () => {
    render(<CafeApplicationWizard />);
    await fill(/organization name/i, 'Filter Kaapi Co');
    await advance();
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByLabelText(/organization name/i)).toHaveValue('Filter Kaapi Co');
  });
});
