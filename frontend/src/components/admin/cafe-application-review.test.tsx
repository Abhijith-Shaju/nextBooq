import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CafeApplicationReview } from './cafe-application-review';

const approve = vi.fn();
const reject = vi.fn();

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('@/hooks/admin/use-review-cafe-application', () => ({
  useApproveCafeApplication: () => ({ mutate: approve, isPending: false }),
  useRejectCafeApplication: () => ({ mutate: reject, isPending: false }),
}));

const application = {
  id: 'app_1',
  application_ref: 'NB-7K2M-9QRT',
  status: 'pending' as const,
  organization_name: 'Filter Kaapi Co',
  cafe_name: 'Filter Kaapi',
  cafe_slug: 'filter-kaapi',
  timezone: 'Asia/Kolkata',
  created_at: '2026-08-29T10:00:00.000Z',
  review_note: '',
  address: {
    line1: '12 Church Street', line2: '', landmark: '', city: 'Bengaluru',
    state: 'Karnataka', postal_code: '560001', country: 'India',
    map_url: 'https://maps.google.com/?q=filter+kaapi',
  },
  applicant: { id: 'u1', name: 'Asha Menon', email: 'asha@example.com', phone: '+91 98765 43210' },
};

describe('CafeApplicationReview', () => {
  beforeEach(() => { approve.mockClear(); reject.mockClear(); });

  test('shows everything needed to verify the cafe', () => {
    render(<CafeApplicationReview application={application} />);
    expect(screen.getByText('NB-7K2M-9QRT')).toBeInTheDocument();
    expect(screen.getByText(/asha@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/12 Church Street/)).toBeInTheDocument();
    expect(screen.getByText(/560001/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open in maps/i })).toHaveAttribute(
      'href', 'https://maps.google.com/?q=filter+kaapi'
    );
  });

  test('approves with the chosen subscription terms', async () => {
    render(<CafeApplicationReview application={application} />);
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));

    expect(approve).toHaveBeenCalledWith(
      { id: 'app_1', subscription: { status: 'active', term_months: 12, price_per_month: 7000, note: undefined } },
      expect.anything()
    );
  });

  test('cannot reject without a note', async () => {
    render(<CafeApplicationReview application={application} />);
    await userEvent.click(screen.getByRole('button', { name: /reject/i }));
    expect(reject).not.toHaveBeenCalled();
    expect(screen.getByText(/tell the applicant why/i)).toBeInTheDocument();
  });

  test('rejects with the note once given', async () => {
    render(<CafeApplicationReview application={application} />);
    await userEvent.type(screen.getByLabelText(/rejection note/i), 'Could not verify the address');
    await userEvent.click(screen.getByRole('button', { name: /reject/i }));

    expect(reject).toHaveBeenCalledWith(
      { id: 'app_1', note: 'Could not verify the address' },
      expect.anything()
    );
  });

  test('a pending application shows a "Pending review" status and the full approve/reject actions', () => {
    render(<CafeApplicationReview application={application} />);

    expect(screen.getByText(/pending review/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
  });

  test('an approved application shows its status, hides approve/reject, and links to the live cafe instead', () => {
    render(<CafeApplicationReview application={{ ...application, status: 'approved' }} />);

    expect(screen.getByText(/^approved$/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve & provision/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reject$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute(
      'href',
      '/filter-kaapi/dashboard'
    );
  });

  test('a rejected application shows its status and hides both action sections', () => {
    render(
      <CafeApplicationReview
        application={{ ...application, status: 'rejected', review_note: 'Duplicate registration.' }}
      />
    );

    expect(screen.getByText(/^rejected$/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve & provision/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reject$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/duplicate registration/i)).toBeInTheDocument();
  });
});
