import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ForgotPasswordPage from './page';

const mutateMock = vi.fn();
vi.mock('@/hooks/auth/use-forgot-password', () => ({
  useForgotPassword: () => ({ mutate: mutateMock, isPending: false }),
}));

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    mutateMock.mockReset();
  });

  test('submits the entered email to the mutation', () => {
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByPlaceholderText('name@cafe.com'), { target: { value: 'someone@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(mutateMock).toHaveBeenCalledWith(
      { email: 'someone@example.com' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  test('shows the generic confirmation message after a successful submission', async () => {
    mutateMock.mockImplementation((_payload, { onSuccess }) => onSuccess());
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByPlaceholderText('name@cafe.com'), { target: { value: 'someone@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => expect(screen.getByText(/we've sent a reset link/i)).toBeInTheDocument());
  });

  test('shows the same generic confirmation message even when the mutation errors, to avoid leaking account existence', async () => {
    mutateMock.mockImplementation((_payload, { onError }) => onError());
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByPlaceholderText('name@cafe.com'), { target: { value: 'someone@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => expect(screen.getByText(/we've sent a reset link/i)).toBeInTheDocument());
  });

  test('has a link back to the login page', () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByRole('link', { name: /back to login/i })).toHaveAttribute('href', '/auth/login');
  });
});
