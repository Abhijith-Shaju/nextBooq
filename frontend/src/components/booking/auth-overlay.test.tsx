import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AuthOverlay } from './auth-overlay';

const bookTableMutate = vi.fn();
const quickAuthMutateAsync = vi.fn();
let mockAuth = { isAuthenticated: false, user: null as any };

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => mockAuth,
}));

let mockCafe: any = {
  id: 'cafe_1',
  slug: 'demo-cafe',
  name: 'Demo Cafe',
  timezone: 'Asia/Kolkata',
  reservation_rules: { hold_duration_minutes: 10 },
};

vi.mock('@/components/providers/tenant-provider', () => ({
  useTenant: () => ({ cafe: mockCafe }),
}));

vi.mock('@/store/use-booking-store', () => ({
  useBookingStore: () => ({
    date: new Date('2026-09-01T00:00:00.000Z'),
    time: '19:00',
    partySize: 2,
  }),
}));

vi.mock('@/hooks/public/use-book-table', () => ({
  useBookTable: () => ({ mutate: bookTableMutate, isPending: false }),
}));

vi.mock('@/hooks/auth/use-customer-quick-auth', () => ({
  useCustomerQuickAuth: () => ({ mutateAsync: quickAuthMutateAsync, isPending: false }),
}));

describe('AuthOverlay', () => {
  beforeEach(() => {
    bookTableMutate.mockReset();
    quickAuthMutateAsync.mockReset();
    mockAuth = { isAuthenticated: false, user: null };
  });

  test('requires guest details before holding a table when signed out', () => {
    render(<AuthOverlay open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /proceed to payment/i }));
    expect(quickAuthMutateAsync).not.toHaveBeenCalled();
    expect(bookTableMutate).not.toHaveBeenCalled();
  });

  test('quick-authenticates a guest then holds the table', async () => {
    quickAuthMutateAsync.mockResolvedValue(undefined);

    render(<AuthOverlay open onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Jane Doe'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByPlaceholderText('jane@example.com'), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('+91 98765 43210'), { target: { value: '+919876543210' } });
    fireEvent.change(
      screen.getByPlaceholderText('Choose a password for your account'),
      { target: { value: 'password123' } }
    );

    fireEvent.click(screen.getByRole('button', { name: /proceed to payment/i }));

    await vi.waitFor(() =>
      expect(quickAuthMutateAsync).toHaveBeenCalledWith({
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+919876543210',
        password: 'password123',
      })
    );
    await vi.waitFor(() =>
      expect(bookTableMutate).toHaveBeenCalledWith(
        expect.objectContaining({ party_size: 2 }),
        expect.any(Object)
      )
    );
  });

  test('holds the table directly for an already-authenticated, verified user', () => {
    mockAuth = {
      isAuthenticated: true,
      user: { name: 'Existing User', email: 'existing@example.com', is_email_verified: true },
    };

    render(<AuthOverlay open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /proceed to payment/i }));

    expect(quickAuthMutateAsync).not.toHaveBeenCalled();
    expect(bookTableMutate).toHaveBeenCalledWith(
      expect.objectContaining({ party_size: 2 }),
      expect.any(Object)
    );
  });

  test("resolves the slot time in the cafe's timezone, not the browser's", () => {
    mockAuth = {
      isAuthenticated: true,
      user: { name: 'Existing User', email: 'existing@example.com', is_email_verified: true },
    };
    mockCafe = { ...mockCafe, timezone: 'Asia/Kolkata' };

    render(<AuthOverlay open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /proceed to payment/i }));

    const [payload] = bookTableMutate.mock.calls[0];

    // The invariant that matters, and the one the old
    // `new Date(`${dateStr}T${time}:00`)` broke: whatever instant we send,
    // it must read back as the 19:00 slot the diner actually tapped when
    // rendered in the cafe's own timezone. Asserted this way rather than
    // against a fixed ISO string so the test does not depend on the
    // timezone the test runner happens to sit in.
    const asCafeSeesIt = new Date(payload.start_time).toLocaleString('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    expect(asCafeSeesIt).toBe('19:00');
  });

  test('blocks holding a table for an unverified authenticated user', () => {
    mockAuth = {
      isAuthenticated: true,
      user: { name: 'Unverified User', email: 'unverified@example.com', is_email_verified: false },
    };

    render(<AuthOverlay open onOpenChange={vi.fn()} />);

    expect(screen.getByText(/email verification required/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /proceed to payment/i })).toBeDisabled();
  });
});
