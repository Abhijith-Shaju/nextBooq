import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CafeApplicationWizard } from './cafe-application-wizard';
import { useMyCafeApplication } from '@/hooks/onboarding/use-my-cafe-application';

const mutate = vi.fn();
const push = vi.fn();
const replace = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));
vi.mock('@/hooks/onboarding/use-submit-cafe-application', () => ({
  useSubmitCafeApplication: () => ({ mutate, isPending: false }),
}));
vi.mock('@/hooks/onboarding/use-my-cafe-application', () => ({
  useMyCafeApplication: vi.fn(),
}));

const fill = async (label: RegExp, value: string) => {
  await userEvent.type(screen.getByLabelText(label), value);
};

const advance = async () => userEvent.click(screen.getByRole('button', { name: /continue/i }));

const baseApplication = {
  id: 'app1',
  application_ref: 'CAFE-0001',
  cafe_slug: 'filter-kaapi',
  cafe_name: 'Filter Kaapi',
  created_at: '2026-08-01T00:00:00.000Z',
  review_note: '',
};

describe('CafeApplicationWizard', () => {
  beforeEach(() => {
    mutate.mockClear();
    push.mockClear();
    replace.mockClear();
    window.sessionStorage.clear();
    // Default: no existing application, so the wizard is reachable — most
    // tests exercise the form itself, not the precondition guard.
    vi.mocked(useMyCafeApplication).mockReturnValue({ data: null, isLoading: false } as any);
  });

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

describe('CafeApplicationWizard — existing-application guard', () => {
  beforeEach(() => {
    mutate.mockClear();
    push.mockClear();
    replace.mockClear();
    window.sessionStorage.clear();
  });

  test('a pending application redirects away instead of showing the form', () => {
    vi.mocked(useMyCafeApplication).mockReturnValue({
      data: { ...baseApplication, status: 'pending' },
      isLoading: false,
    } as any);

    render(<CafeApplicationWizard />);

    expect(replace).toHaveBeenCalledWith('/onboarding/status');
    expect(screen.queryByLabelText(/organization name/i)).not.toBeInTheDocument();
  });

  test('an approved application redirects away instead of showing the form', () => {
    vi.mocked(useMyCafeApplication).mockReturnValue({
      data: { ...baseApplication, status: 'approved' },
      isLoading: false,
    } as any);

    render(<CafeApplicationWizard />);

    expect(replace).toHaveBeenCalledWith('/onboarding/status');
    expect(screen.queryByLabelText(/organization name/i)).not.toBeInTheDocument();
  });

  test('a rejected application is allowed through to re-apply', () => {
    vi.mocked(useMyCafeApplication).mockReturnValue({
      data: { ...baseApplication, status: 'rejected' },
      isLoading: false,
    } as any);

    render(<CafeApplicationWizard />);

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/organization name/i)).toBeInTheDocument();
  });

  test('a withdrawn application is allowed through to re-apply', () => {
    vi.mocked(useMyCafeApplication).mockReturnValue({
      data: { ...baseApplication, status: 'withdrawn' },
      isLoading: false,
    } as any);

    render(<CafeApplicationWizard />);

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/organization name/i)).toBeInTheDocument();
  });

  test('while the precondition check is loading, neither redirects nor flashes the form', () => {
    vi.mocked(useMyCafeApplication).mockReturnValue({ data: undefined, isLoading: true } as any);

    render(<CafeApplicationWizard />);

    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/organization name/i)).not.toBeInTheDocument();
  });
});

describe('CafeApplicationWizard — draft persistence', () => {
  beforeEach(() => {
    mutate.mockClear();
    push.mockClear();
    replace.mockClear();
    window.sessionStorage.clear();
    vi.mocked(useMyCafeApplication).mockReturnValue({ data: null, isLoading: false } as any);
  });

  test('a value typed into step 1 survives a full unmount and remount (proves sessionStorage, not just React state)', async () => {
    const { unmount } = render(<CafeApplicationWizard />);
    await fill(/organization name/i, 'Filter Kaapi Co');

    // Give the persistence effect a tick to flush to sessionStorage before
    // the component tree is torn down.
    await waitFor(() => expect(window.sessionStorage.getItem('nextbooq:onboarding:cafe-application-draft')).toContain('Filter Kaapi Co'));

    unmount();

    render(<CafeApplicationWizard />);

    expect(screen.getByLabelText(/organization name/i)).toHaveValue('Filter Kaapi Co');
  });

  test('submitting successfully clears the draft so a later visit starts fresh', async () => {
    mutate.mockImplementation((_payload, { onSuccess }) => onSuccess());

    const { unmount } = render(<CafeApplicationWizard />);
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

    await waitFor(() => expect(window.sessionStorage.getItem('nextbooq:onboarding:cafe-application-draft')).toBeNull());

    unmount();
    render(<CafeApplicationWizard />);

    expect(screen.getByLabelText(/organization name/i)).toHaveValue('');
  });

  test('a corrupted draft in sessionStorage is ignored rather than breaking the form', () => {
    window.sessionStorage.setItem('nextbooq:onboarding:cafe-application-draft', '{not valid json');

    render(<CafeApplicationWizard />);

    expect(screen.getByLabelText(/organization name/i)).toHaveValue('');
  });
});
