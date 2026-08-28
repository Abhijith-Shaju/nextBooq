import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ContactForm } from './ContactForm';
import { axiosInstance } from '@/hooks/api/axios-instance';

vi.mock('@/hooks/api/axios-instance', () => ({
  axiosInstance: { post: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('ContactForm', () => {
  test('renders empty Name, Email, and Message fields', () => {
    render(<ContactForm />);

    expect(screen.getByLabelText(/name/i)).toHaveValue('');
    expect(screen.getByLabelText(/email/i)).toHaveValue('');
    expect(screen.getByLabelText(/message/i)).toHaveValue('');
  });

  test('shows a per-field inline error and does not submit when a field is left blank', async () => {
    render(<ContactForm />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Jane Doe' } });
    // Email and Message left blank.
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/message is required/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-invalid', 'true');
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  test('rejects a malformed email address without hitting the server', async () => {
    render(<ContactForm />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: 'Hello there.' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  test('submits the form and shows a success state, clearing the fields', async () => {
    vi.mocked(axiosInstance.post).mockResolvedValue({ data: { status: 'success' } });

    render(<ContactForm />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: 'Hello there.' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() =>
      expect(axiosInstance.post).toHaveBeenCalledWith('/api/v1/contact', {
        name: 'Jane Doe',
        email: 'jane@example.com',
        message: 'Hello there.',
      })
    );

    await waitFor(() => expect(screen.getByLabelText(/name/i)).toHaveValue(''));
    expect(screen.getByLabelText(/email/i)).toHaveValue('');
    expect(screen.getByLabelText(/message/i)).toHaveValue('');
  });

  test('shows the backend error message when submission fails', async () => {
    vi.mocked(axiosInstance.post).mockRejectedValue({
      response: { data: { message: 'A valid email address is required' } },
    });

    render(<ContactForm />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: 'Hello there.' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() =>
      expect(screen.getByText(/a valid email address is required/i)).toBeInTheDocument()
    );
  });
});
