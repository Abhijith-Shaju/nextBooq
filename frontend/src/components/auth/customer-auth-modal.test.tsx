import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CustomerAuthModal } from './customer-auth-modal';

const loginMutate = vi.fn();
const registerMutate = vi.fn();
const forgotMutate = vi.fn();

// "Log In" appears both as the tab toggle and as the submit button.
const getLoginSubmitButton = () =>
  screen.getAllByRole('button', { name: /log in/i }).find((btn) => btn.getAttribute('type') === 'submit')!;

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/auth/use-login', () => ({
  useLogin: () => ({ mutate: loginMutate, isPending: false }),
}));

vi.mock('@/hooks/auth/use-register', () => ({
  useRegister: () => ({ mutate: registerMutate, isPending: false }),
}));

vi.mock('@/hooks/auth/use-forgot-password', () => ({
  useForgotPassword: () => ({ mutate: forgotMutate, isPending: false }),
}));

describe('CustomerAuthModal', () => {
  beforeEach(() => {
    loginMutate.mockReset();
    registerMutate.mockReset();
    forgotMutate.mockReset();
  });

  test('does not render its dialog content when closed', () => {
    render(<CustomerAuthModal open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByText(/customer log in/i)).not.toBeInTheDocument();
  });

  test('submits login credentials and closes on success', () => {
    const onOpenChange = vi.fn();
    loginMutate.mockImplementation((_payload, { onSuccess }: any) => onSuccess());

    render(<CustomerAuthModal open onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByPlaceholderText('your@email.com'), { target: { value: 'guest@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    fireEvent.click(getLoginSubmitButton());

    expect(loginMutate).toHaveBeenCalledWith(
      { email: 'guest@example.com', password: 'password123' },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test('does not submit the login form when a field is missing', () => {
    render(<CustomerAuthModal open onOpenChange={vi.fn()} />);
    fireEvent.click(getLoginSubmitButton());
    expect(loginMutate).not.toHaveBeenCalled();
  });

  test('switches to the sign-up tab and submits registration details', () => {
    const onOpenChange = vi.fn();
    registerMutate.mockImplementation((_payload, { onSuccess }: any) => onSuccess());

    render(<CustomerAuthModal open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));

    fireEvent.change(screen.getByPlaceholderText('Jane Doe'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByPlaceholderText('jane@example.com'), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('+91 98765 43210'), { target: { value: '+919876543210' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    // Creating an account requires the clickwrap acceptance; the API refuses
    // without it, so the form must not be submittable without it either.
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(registerMutate).toHaveBeenCalledWith(
      {
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+919876543210',
        password: 'password123',
        accept_terms: true,
      },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test('does not submit registration when a required field is missing', () => {
    render(<CustomerAuthModal open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(registerMutate).not.toHaveBeenCalled();
  });

  describe('showing the password', () => {
    test('masks the password until asked, then reveals it', () => {
      render(<CustomerAuthModal open onOpenChange={vi.fn()} />);
      const field = screen.getByPlaceholderText('••••••••');
      expect(field).toHaveAttribute('type', 'password');

      fireEvent.click(screen.getByRole('button', { name: /show password/i }));
      expect(field).toHaveAttribute('type', 'text');

      fireEvent.click(screen.getByRole('button', { name: /hide password/i }));
      expect(field).toHaveAttribute('type', 'password');
    });

    test('re-masks when the view changes', () => {
      // A guest may reveal the password to check a typo; it should not still be
      // legible on screen when they come back to the form later.
      render(<CustomerAuthModal open onOpenChange={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /show password/i }));
      fireEvent.click(screen.getByRole('button', { name: /sign up/i }));

      expect(screen.getByPlaceholderText('••••••••')).toHaveAttribute('type', 'password');
    });
  });

  describe('resetting a forgotten password', () => {
    const openReset = () => {
      render(<CustomerAuthModal open onOpenChange={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    };

    test('resets inside the modal rather than navigating away', () => {
      // The /auth/forgot-password page lives in the control plane, so a link out
      // would drop a guest out of the cafe storefront mid-booking.
      openReset();
      expect(screen.getByText(/reset your password/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /forgot password/i })).not.toBeInTheDocument();
    });

    test('sends the reset request for the entered email', () => {
      openReset();
      fireEvent.change(screen.getByPlaceholderText('your@email.com'), {
        target: { value: 'guest@example.com' },
      });
      fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

      expect(forgotMutate).toHaveBeenCalledWith(
        { email: 'guest@example.com' },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
      );
    });

    test('says the same thing whether or not the account exists', () => {
      // Anything else turns this form into an account-enumeration oracle, so the
      // failure path must land on the identical confirmation.
      forgotMutate.mockImplementation((_payload, { onError }: any) => onError());
      openReset();
      fireEvent.change(screen.getByPlaceholderText('your@email.com'), {
        target: { value: 'nobody@example.com' },
      });
      fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

      expect(screen.getByText(/if an account exists for that email/i)).toBeInTheDocument();
    });

    test('can go back to log in', () => {
      openReset();
      fireEvent.click(screen.getByRole('button', { name: /back to log in/i }));
      expect(getLoginSubmitButton()).toBeInTheDocument();
    });
  });
});
