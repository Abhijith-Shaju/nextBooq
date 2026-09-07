import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { PaymentsEditor } from './payments-editor';
import { axiosInstance } from '@/hooks/api/axios-instance';

// PaymentsEditor calls useRequestStepUpOtp, which is a react-query mutation,
// so it needs a QueryClientProvider ancestor even though no test here
// exercises the step-up flow. Same wrapper as settings/page.test.tsx.
const renderEditor = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

vi.mock('@/hooks/api/axios-instance', () => ({
  axiosInstance: { put: vi.fn() },
}));

describe('PaymentsEditor', () => {
  test('shows a "not configured" empty state with inputs when payments are not yet set up', () => {
    renderEditor(<PaymentsEditor cafeId="cafe1" razorpayKeyId="" configured={false} onSaved={vi.fn()} />);

    expect(screen.getByLabelText(/key id/i)).toHaveValue('');
    expect(screen.getByLabelText(/key secret/i)).toHaveValue('');
    expect(screen.getByText(/not.*configured|not yet set up/i)).toBeInTheDocument();
  });

  test('shows the saved Key ID and a "configured" badge when already configured', () => {
    renderEditor(<PaymentsEditor cafeId="cafe1" razorpayKeyId="rzp_live_abc123" configured={true} onSaved={vi.fn()} />);

    expect(screen.getByText('rzp_live_abc123')).toBeInTheDocument();
    expect(screen.getByText(/live mode/i)).toBeInTheDocument();
  });

  test('shows a "test mode" badge for a rzp_test_ key id', () => {
    renderEditor(<PaymentsEditor cafeId="cafe1" razorpayKeyId="rzp_test_abc123" configured={true} onSaved={vi.fn()} />);

    expect(screen.getByText(/test mode/i)).toBeInTheDocument();
  });

  test('submits Key ID and Key Secret and calls onSaved with the returned webhook details', async () => {
    const onSaved = vi.fn();
    vi.mocked(axiosInstance.put).mockResolvedValue({
      data: {
        data: {
          payments: { razorpay_key_id: 'rzp_test_new', configured: true },
          payments_webhook: { url: 'https://api.nextbooq.in/api/v1/webhooks/razorpay/vtcafe', secret: 'whsec_abc' },
        },
      },
    });

    renderEditor(<PaymentsEditor cafeId="cafe1" razorpayKeyId="" configured={false} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText(/key id/i), { target: { value: 'rzp_test_new' } });
    fireEvent.change(screen.getByLabelText(/key secret/i), { target: { value: 'somesecretvalue' } });
    // Saving payout details is step-up protected: the button stays disabled
    // until a 6-digit code is entered, and the code is sent with the request.
    fireEvent.change(screen.getByPlaceholderText(/6-digit security code/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /save.*payment|connect razorpay/i }));

    await waitFor(() =>
      expect(axiosInstance.put).toHaveBeenCalledWith('/api/v1/cafes/cafe1/payments', {
        razorpay_key_id: 'rzp_test_new',
        razorpay_key_secret: 'somesecretvalue',
        otp_code: '123456',
      })
    );
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({
        url: 'https://api.nextbooq.in/api/v1/webhooks/razorpay/vtcafe',
        secret: 'whsec_abc',
      })
    );
  });

  test('shows the backend validation error message when the save is rejected', async () => {
    vi.mocked(axiosInstance.put).mockRejectedValue({
      response: { data: { message: "These Razorpay credentials couldn't be verified." } },
    });

    renderEditor(<PaymentsEditor cafeId="cafe1" razorpayKeyId="" configured={false} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/key id/i), { target: { value: 'rzp_test_bad' } });
    fireEvent.change(screen.getByLabelText(/key secret/i), { target: { value: 'wrongsecret' } });
    fireEvent.change(screen.getByPlaceholderText(/6-digit security code/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /save.*payment|connect razorpay/i }));

    await waitFor(() =>
      expect(screen.getByText(/couldn't be verified/i)).toBeInTheDocument()
    );
  });
});
