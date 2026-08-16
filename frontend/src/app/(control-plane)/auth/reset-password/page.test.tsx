import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ResetPasswordPage from './page';

let searchParamsValue = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsValue,
}));

const mutateMock = vi.fn();
vi.mock('@/hooks/auth/use-reset-password', () => ({
  useResetPassword: () => ({ mutate: mutateMock, isPending: false }),
}));

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    mutateMock.mockReset();
    searchParamsValue = new URLSearchParams();
  });

  test('shows an invalid-link message when there is no token in the URL', () => {
    render(<ResetPasswordPage />);
    expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument();
    expect(mutateMock).not.toHaveBeenCalled();
  });

  test('submits the token and new password to the mutation', () => {
    searchParamsValue = new URLSearchParams('token=abc123');
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'BrandNewPassword1!' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    expect(mutateMock).toHaveBeenCalledWith(
      { token: 'abc123', password: 'BrandNewPassword1!' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  test('shows a success message and login link after a successful reset', async () => {
    searchParamsValue = new URLSearchParams('token=abc123');
    mutateMock.mockImplementation((_payload, { onSuccess }) => onSuccess());
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'BrandNewPassword1!' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => expect(screen.getByText(/password updated/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /go to login/i })).toHaveAttribute('href', '/auth/login');
  });

  test('shows an inline error when the mutation fails (expired/invalid/reused token)', async () => {
    searchParamsValue = new URLSearchParams('token=abc123');
    mutateMock.mockImplementation((_payload, { onError }) => onError());
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'BrandNewPassword1!' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument());
  });
});
