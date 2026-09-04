import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import RegisterPage from './page';

const registerMutate = vi.fn();
const push = vi.fn();

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/auth/use-register', () => ({
  useRegister: () => ({ mutate: registerMutate, isPending: false }),
}));

// The Terms claim acceptance happens by clicking "I Agree". Before this gate
// existed there was no checkbox anywhere and nothing recorded consent, which
// left acceptance as browsewrap in practice. The API now refuses a
// registration without the flag, so the form has to collect it and send it.
describe('RegisterPage terms acceptance', () => {
  beforeEach(() => {
    registerMutate.mockReset();
    push.mockReset();
  });

  const fillForm = () => {
    fireEvent.change(screen.getByPlaceholderText('John Doe'), {
      target: { value: 'Jane Doe' },
    });
    fireEvent.change(screen.getByPlaceholderText('name@cafe.com'), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('+91 98765 43210'), {
      target: { value: '+919876543210' },
    });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), {
      target: { value: 'password123' },
    });
  };

  test('cannot submit until the terms are accepted', () => {
    render(<RegisterPage />);
    fillForm();

    expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.getByRole('button', { name: /create account/i })).not.toBeDisabled();
  });

  test('sends the acceptance flag with the registration', () => {
    render(<RegisterPage />);
    fillForm();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(registerMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Jane Doe',
        email: 'jane@example.com',
        accept_terms: true,
      }),
      expect.any(Object)
    );
  });

  test('links to the documents being accepted', () => {
    // An acceptance the user cannot read is not much of an acceptance.
    render(<RegisterPage />);

    expect(screen.getByRole('link', { name: /terms and conditions/i })).toHaveAttribute(
      'href',
      '/legal/terms'
    );
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/legal/privacy'
    );
  });
});
