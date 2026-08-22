import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import VerifyEmailPage from './page';
import { toast } from 'sonner';

const renderWithClient = (ui: React.ReactElement) => {
  const queryClient = new QueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

const replaceMock = vi.fn();
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

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

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    pushMock.mockReset();
    verifyMutateMock.mockReset();
    resendMutateMock.mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  test('redirects to login when there is no authenticated user', async () => {
    useAuthMock.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false });

    renderWithClient(<VerifyEmailPage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/auth/login?callbackUrl=%2Fauth%2Fverify-email'));
  });

  test('renders nothing while auth is still loading', () => {
    useAuthMock.mockReturnValue({ user: null, isAuthenticated: false, isLoading: true });

    const { queryByText } = renderWithClient(<VerifyEmailPage />);

    expect(queryByText('Verify your email')).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  test('shows an already-verified state without a form when the user is already verified', () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', email: 'user@example.com', is_email_verified: true },
      isAuthenticated: true,
      isLoading: false,
    });

    renderWithClient(<VerifyEmailPage />);

    expect(screen.getByText(/your email is already verified/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /verify email/i })).not.toBeInTheDocument();
  });

  test('submits the entered code to the mutation', () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', email: 'user@example.com', is_email_verified: false },
      isAuthenticated: true,
      isLoading: false,
    });

    renderWithClient(<VerifyEmailPage />);

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

    renderWithClient(<VerifyEmailPage />);

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

    renderWithClient(<VerifyEmailPage />);

    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: /verify email/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Invalid or expired code. Please try again.'));
    expect(screen.getByPlaceholderText('6-digit code')).toBeInTheDocument();
  });

  test('resend button triggers the resend mutation', () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', email: 'user@example.com', is_email_verified: false },
      isAuthenticated: true,
      isLoading: false,
    });

    renderWithClient(<VerifyEmailPage />);

    fireEvent.click(screen.getByRole('button', { name: /resend/i }));

    expect(resendMutateMock).toHaveBeenCalled();
  });
});
