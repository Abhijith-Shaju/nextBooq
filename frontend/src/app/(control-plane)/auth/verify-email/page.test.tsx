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
let searchParamsMock = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
  useSearchParams: () => searchParamsMock,
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

const changeEmailMutateMock = vi.fn();
vi.mock('@/hooks/auth/use-change-email', () => ({
  useChangeEmail: () => ({ mutate: changeEmailMutateMock, isPending: false }),
}));

const requestStepUpOtpMutateMock = vi.fn();
vi.mock('@/hooks/auth/use-request-step-up-otp', () => ({
  useRequestStepUpOtp: () => ({ mutate: requestStepUpOtpMutateMock, isPending: false }),
}));

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    pushMock.mockReset();
    verifyMutateMock.mockReset();
    resendMutateMock.mockReset();
    changeEmailMutateMock.mockReset();
    requestStepUpOtpMutateMock.mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
    searchParamsMock = new URLSearchParams();
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

  test('"Not your email? Change it" swaps the code form for the change-email form', () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', email: 'wrong-typo@example.com', is_email_verified: false },
      isAuthenticated: true,
      isLoading: false,
    });

    renderWithClient(<VerifyEmailPage />);

    fireEvent.click(screen.getByRole('button', { name: /not your email/i }));

    expect(screen.getByPlaceholderText('New email address')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('6-digit code')).not.toBeInTheDocument();
  });

  test('submitting the change-email form on an unverified account skips the step-up code and shows a confirmation toast', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', email: 'wrong-typo@example.com', is_email_verified: false },
      isAuthenticated: true,
      isLoading: false,
    });
    changeEmailMutateMock.mockImplementation((_payload, { onSuccess }) => onSuccess());

    renderWithClient(<VerifyEmailPage />);

    fireEvent.click(screen.getByRole('button', { name: /not your email/i }));
    fireEvent.change(screen.getByPlaceholderText('New email address'), { target: { value: 'fixed@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Current password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /save email/i }));

    expect(changeEmailMutateMock).toHaveBeenCalledWith(
      { newEmail: 'fixed@example.com', currentPassword: 'secret123' },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("We've sent a new code to fixed@example.com.")
    );
  });

  test('cancelling the change-email form returns to the code-entry form', () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', email: 'wrong-typo@example.com', is_email_verified: false },
      isAuthenticated: true,
      isLoading: false,
    });

    renderWithClient(<VerifyEmailPage />);

    fireEvent.click(screen.getByRole('button', { name: /not your email/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByPlaceholderText('6-digit code')).toBeInTheDocument();
  });

  test('a control-plane registration lands on the onboarding role choice', async () => {
    searchParamsMock = new URLSearchParams('callbackUrl=%2F&source=register');
    useAuthMock.mockReturnValue({
      user: { id: 'u1', email: 'user@example.com', is_email_verified: false },
      isAuthenticated: true,
      isLoading: false,
    });
    verifyMutateMock.mockImplementation((_payload, { onSuccess }) => onSuccess());

    renderWithClient(<VerifyEmailPage />);

    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify email/i }));

    await waitFor(
      () => expect(pushMock).toHaveBeenCalledWith('/onboarding?callbackUrl=%2F'),
      { timeout: 2000 }
    );
  });

  test('a storefront verification never lands on the onboarding role choice', async () => {
    // The storefront quick-auth reaches this page with a callbackUrl but no
    // `source` — only the control-plane register page sets source=register.
    searchParamsMock = new URLSearchParams('callbackUrl=%2Fdemo-cafe');
    useAuthMock.mockReturnValue({
      user: { id: 'u1', email: 'user@example.com', is_email_verified: false },
      isAuthenticated: true,
      isLoading: false,
    });
    verifyMutateMock.mockImplementation((_payload, { onSuccess }) => onSuccess());

    renderWithClient(<VerifyEmailPage />);

    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify email/i }));

    await waitFor(
      () => expect(pushMock).toHaveBeenCalledWith('/demo-cafe'),
      { timeout: 2000 }
    );
    expect(replaceMock).not.toHaveBeenCalledWith(expect.stringMatching(/^\/onboarding/));
    expect(pushMock).not.toHaveBeenCalledWith(expect.stringMatching(/^\/onboarding/));
  });
});
