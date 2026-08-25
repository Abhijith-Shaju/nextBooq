import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ErrorFallback } from './error-fallback';

describe('ErrorFallback', () => {
  test('renders a message and calls reset when "Try again" is clicked', () => {
    const reset = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<ErrorFallback error={new Error('boom')} reset={reset} />);

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });

  test('links "Go home" to the default root by default', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<ErrorFallback error={new Error('boom')} reset={vi.fn()} />);

    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute('href', '/');

    consoleErrorSpy.mockRestore();
  });

  test('honors a custom homeHref and homeLabel', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorFallback
        error={new Error('boom')}
        reset={vi.fn()}
        homeHref="/admin"
        homeLabel="Back to overview"
      />
    );

    expect(screen.getByRole('link', { name: /back to overview/i })).toHaveAttribute('href', '/admin');

    consoleErrorSpy.mockRestore();
  });

  test('logs the error for diagnostics', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('boom');

    render(<ErrorFallback error={error} reset={vi.fn()} />);

    expect(consoleErrorSpy).toHaveBeenCalledWith('[ErrorFallback]', error);

    consoleErrorSpy.mockRestore();
  });
});
