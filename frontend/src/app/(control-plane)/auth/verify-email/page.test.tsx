import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import VerifyEmailPage from './page';

const replaceMock = vi.fn();
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
}));

const { toastMock } = vi.hoisted(() => ({
  toastMock: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: toastMock }));

const useAuthMock = vi.fn();
vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => useAuthMock(),
}));

const verifyMutateMock = vi.fn();
vi.mock('@/hooks/auth/use-verify-email', () => ({
  useVerifyEmail: () => ({ mutate: verifyMutateMock, isPending: false }),
}));

const resendMutateMock = vi.fn();
vi.mock('@/hooks/auth/use-resend-verification-email', () => ({
  useResendVerificationEmail: () => ({ mutate: resendMutateMock, isPending: false }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    pushMock.mockReset();
    verifyMutateMock.mockReset();
    resendMutateMock.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
  });

  test('redirects to login when there is no authenticated user', async () => {
    useAuthMock.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false });

    render(<VerifyEmailPage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/auth/login?callbackUrl=%2Fauth%2Fverify-email'));
  });

  test('renders nothing while auth is still loading', () => {
    useAuthMock.mockReturnValue({ user: null, isAuthenticated: false, isLoading: true });

    const { queryByText } = render(<VerifyEmailPage />);

    expect(queryByText('Verify your email')).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  test('returns an already-verified user to the requested destination', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', email: 'user@example.com', is_email_verified: true },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<VerifyEmailPage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
  });

  test('submits the entered code to the mutation', () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', email: 'user@example.com', is_email_verified: false },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<VerifyEmailPage />);

    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify email/i }));

    expect(verifyMutateMock).toHaveBeenCalledWith(
      { code: '123456' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  test('shows a distinct success message after a successful verification', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', email: 'user@example.com', is_email_verified: false },
      isAuthenticated: true,
      isLoading: false,
    });
    verifyMutateMock.mockImplementation((_payload, { onSuccess }) => onSuccess());

    render(<VerifyEmailPage />);

    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify email/i }));

    await waitFor(() => expect(screen.getByText(/email verified! taking you back/i)).toBeInTheDocument());
  });

  test('shows an inline error and keeps the form when verification fails', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', email: 'user@example.com', is_email_verified: false },
      isAuthenticated: true,
      isLoading: false,
    });
    verifyMutateMock.mockImplementation((_payload, { onError }) => onError());

    render(<VerifyEmailPage />);

    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: /verify email/i }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Invalid or expired code. Please try again.'));
    expect(screen.getByPlaceholderText('6-digit code')).toBeInTheDocument();
  });

  test('resend button triggers the resend mutation', () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', email: 'user@example.com', is_email_verified: false },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<VerifyEmailPage />);

    fireEvent.click(screen.getByRole('button', { name: /resend/i }));

    expect(resendMutateMock).toHaveBeenCalled();
  });
});
