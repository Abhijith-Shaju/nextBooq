import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CustomerAuthModal } from './customer-auth-modal';

const loginMutate = vi.fn();
const registerMutate = vi.fn();

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

describe('CustomerAuthModal', () => {
  beforeEach(() => {
    loginMutate.mockReset();
    registerMutate.mockReset();
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
});
