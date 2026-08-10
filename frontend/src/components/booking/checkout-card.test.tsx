import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { CheckoutCard } from './checkout-card';
import { useBookingStore } from '@/store/use-booking-store';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { openRazorpayCheckout } from '@/lib/razorpay';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
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
    cafe: { id: 'cafe_1', slug: 'demo-cafe', name: 'Demo Cafe', reservation_rules: {}, timezone: 'UTC' },
  }),
}));

describe('CheckoutCard', () => {
  beforeEach(() => {
    useBookingStore.getState().resetBooking();
    vi.mocked(axiosInstance.post).mockReset();
    vi.mocked(openRazorpayCheckout).mockReset();
  });

  test('does not open Razorpay checkout when no real reservation/order has loaded', () => {
    render(<CheckoutCard />);

    const payButton = screen.getByRole('button', { name: /pay/i });
    fireEvent.click(payButton);

    expect(openRazorpayCheckout).not.toHaveBeenCalled();
  });

  test('opens checkout with the real order id, verifies payment server-side, and only then shows success', async () => {
    useBookingStore.getState().setReservation({
      id: 'res_123',
      status: 'PENDING_PAYMENT',
      razorpay_order_id: 'order_real_abc',
      amount: 10000,
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
});
