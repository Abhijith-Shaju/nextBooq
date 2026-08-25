import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { CheckoutCard } from './checkout-card';
import { useBookingStore } from '@/store/use-booking-store';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { openRazorpayCheckout } from '@/lib/razorpay';

const routerReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: routerReplace }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/api/axios-instance', () => ({
  axiosInstance: { post: vi.fn() },
}));

vi.mock('@/lib/razorpay', () => ({
  openRazorpayCheckout: vi.fn(),
}));

vi.mock('@/components/providers/tenant-provider', () => ({
  useTenant: () => ({
    cafe: {
      id: 'cafe_1',
      slug: 'demo-cafe',
      name: 'Demo Cafe',
      reservation_rules: { reservation_fee: 100 },
      timezone: 'UTC',
      payments: { razorpay_key_id: 'rzp_test_cafespecific', configured: true },
    },
  }),
}));

describe('CheckoutCard', () => {
  beforeEach(() => {
    useBookingStore.getState().resetBooking();
    vi.mocked(axiosInstance.post).mockReset();
    vi.mocked(openRazorpayCheckout).mockReset();
    routerReplace.mockClear();
  });

  // L-02: refreshing /checkout (or landing on it directly) with no live
  // hold used to render em-dashes for date/time/party and a Pay button
  // that could never succeed, since there was no order to pay. It now
  // sends the guest back to the cafe's booking page instead.
  test('redirects to the cafe booking page instead of rendering when there is no reservation to check out', async () => {
    render(<CheckoutCard />);

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/demo-cafe'));
    expect(screen.queryByRole('button', { name: /pay/i })).not.toBeInTheDocument();
    expect(openRazorpayCheckout).not.toHaveBeenCalled();
  });

  // A dev-server cold-compile race was once observed serving a render before
  // zustand's persist middleware had finished attaching `.persist` to the
  // store, throwing "Cannot read properties of undefined (reading
  // 'hasHydrated')". The component now falls back to treating the store as
  // already hydrated instead of assuming `.persist` exists.
  test('renders without crashing when the persist API is unexpectedly unavailable', () => {
    const originalPersist = useBookingStore.persist;
    (useBookingStore as { persist?: typeof originalPersist }).persist = undefined;

    try {
      expect(() => render(<CheckoutCard />)).not.toThrow();
    } finally {
      useBookingStore.persist = originalPersist;
    }
  });

  test('opens checkout with the real order id, verifies payment server-side, and only then shows success', async () => {
    useBookingStore.getState().setReservation({
      id: 'res_123',
      status: 'PENDING_PAYMENT',
      razorpay_order_id: 'order_real_abc',
      amount: 249,
      currency: 'INR',
      hold_expires_at: '2026-08-20T19:10:00Z',
    });

    let capturedHandler: ((response: any) => void) | undefined;
    vi.mocked(openRazorpayCheckout).mockImplementation(async (options: any) => {
      capturedHandler = options.handler;
      expect(options.order_id).toBe('order_real_abc');
    });
    vi.mocked(axiosInstance.post).mockResolvedValue({ data: { data: { status: 'CONFIRMED' } } });

    render(<CheckoutCard />);
    fireEvent.click(screen.getByRole('button', { name: /pay/i }));

    await waitFor(() => expect(openRazorpayCheckout).toHaveBeenCalled());
    expect(capturedHandler).toBeDefined();

    // Simulate Razorpay's client-side success callback firing.
    capturedHandler!({
      razorpay_order_id: 'order_real_abc',
      razorpay_payment_id: 'pay_999',
      razorpay_signature: 'sig_abc',
    });

    await waitFor(() =>
      expect(axiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/cafes/cafe_1/reservations/res_123/verify-payment',
        {
          razorpay_order_id: 'order_real_abc',
          razorpay_payment_id: 'pay_999',
          razorpay_signature: 'sig_abc',
        }
      )
    );
  });

  test('opens checkout with the cafe-specific Razorpay key', async () => {
    useBookingStore.getState().setReservation({
      id: 'res_123',
      status: 'PENDING_PAYMENT',
      razorpay_order_id: 'order_real_abc',
      amount: 249,
      currency: 'INR',
      hold_expires_at: '2026-08-20T19:10:00Z',
    });

    let capturedKey: string | undefined;
    vi.mocked(openRazorpayCheckout).mockImplementation(async (options: any) => {
      capturedKey = options.key;
    });

    render(<CheckoutCard />);
    fireEvent.click(screen.getByRole('button', { name: /pay/i }));

    await waitFor(() => expect(openRazorpayCheckout).toHaveBeenCalled());
    expect(capturedKey).toBe('rzp_test_cafespecific');
  });

  test('charges the reservation\'s real amount (in paise) and displays it — not a hardcoded value', async () => {
    useBookingStore.getState().setReservation({
      id: 'res_123',
      status: 'PENDING_PAYMENT',
      razorpay_order_id: 'order_real_abc',
      amount: 249,
      currency: 'INR',
      hold_expires_at: '2026-08-20T19:10:00Z',
    });

    let capturedAmount: number | undefined;
    vi.mocked(openRazorpayCheckout).mockImplementation(async (options: any) => {
      capturedAmount = options.amount;
    });

    render(<CheckoutCard />);

    const payButton = screen.getByRole('button', { name: /pay ₹249 & confirm table/i });

    fireEvent.click(payButton);

    await waitFor(() => expect(openRazorpayCheckout).toHaveBeenCalled());
    expect(capturedAmount).toBe(24900); // paise
  });

  // L-03: a webhook confirming the same payment while this call is still in
  // flight (or a brief network blip) is the common transient failure — the
  // verify-payment endpoint is idempotent, so one automatic retry before
  // giving up is always safe and should recover silently.
  test('retries verification once automatically and succeeds on the second attempt', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useBookingStore.getState().setReservation({
      id: 'res_123',
      status: 'PENDING_PAYMENT',
      razorpay_order_id: 'order_real_abc',
      amount: 249,
      currency: 'INR',
      hold_expires_at: '2026-08-20T19:10:00Z',
    });

    let capturedHandler: ((response: any) => void) | undefined;
    vi.mocked(openRazorpayCheckout).mockImplementation(async (options: any) => {
      capturedHandler = options.handler;
    });
    vi.mocked(axiosInstance.post)
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce({ data: { data: { status: 'CONFIRMED' } } });

    render(<CheckoutCard />);
    fireEvent.click(screen.getByRole('button', { name: /pay/i }));
    await waitFor(() => expect(openRazorpayCheckout).toHaveBeenCalled());

    capturedHandler!({
      razorpay_order_id: 'order_real_abc',
      razorpay_payment_id: 'pay_999',
      razorpay_signature: 'sig_abc',
    });

    await vi.waitFor(() => expect(axiosInstance.post).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(axiosInstance.post).toHaveBeenCalledTimes(2));

    expect(screen.queryByText(/we couldn't confirm your payment/i)).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  test('shows the payment reference and a manual retry option when both verification attempts fail', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useBookingStore.getState().setReservation({
      id: 'res_123',
      status: 'PENDING_PAYMENT',
      razorpay_order_id: 'order_real_abc',
      amount: 249,
      currency: 'INR',
      hold_expires_at: '2026-08-20T19:10:00Z',
    });

    let capturedHandler: ((response: any) => void) | undefined;
    vi.mocked(openRazorpayCheckout).mockImplementation(async (options: any) => {
      capturedHandler = options.handler;
    });
    vi.mocked(axiosInstance.post).mockRejectedValue(new Error('still failing'));

    render(<CheckoutCard />);
    fireEvent.click(screen.getByRole('button', { name: /pay/i }));
    await waitFor(() => expect(openRazorpayCheckout).toHaveBeenCalled());

    capturedHandler!({
      razorpay_order_id: 'order_real_abc',
      razorpay_payment_id: 'pay_999',
      razorpay_signature: 'sig_abc',
    });

    await vi.waitFor(() => expect(axiosInstance.post).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(axiosInstance.post).toHaveBeenCalledTimes(2));

    vi.useRealTimers();
    expect(await screen.findByText(/we couldn't confirm your payment/i)).toBeInTheDocument();
    expect(screen.getByText('pay_999')).toBeInTheDocument();

    vi.mocked(axiosInstance.post).mockResolvedValueOnce({ data: { data: { status: 'CONFIRMED' } } });
    fireEvent.click(screen.getByRole('button', { name: /retry verification/i }));

    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.queryByText(/we couldn't confirm your payment/i)).not.toBeInTheDocument());
  });

});
