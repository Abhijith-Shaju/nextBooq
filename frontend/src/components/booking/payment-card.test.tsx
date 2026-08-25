import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { PaymentCard } from './payment-card';

describe('PaymentCard', () => {
  test('renders nothing for the idle status', () => {
    const { container } = render(<PaymentCard status="idle" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('shows a processing message while opening the payment gateway', () => {
    render(<PaymentCard status="processing" />);
    expect(screen.getByText(/opening payment gateway/i)).toBeInTheDocument();
  });

  test('shows a polling message while confirming payment', () => {
    render(<PaymentCard status="polling" />);
    expect(screen.getByText(/confirming your payment/i)).toBeInTheDocument();
  });

  test('shows a success message when payment is confirmed', () => {
    render(<PaymentCard status="success" />);
    expect(screen.getByText(/payment confirmed/i)).toBeInTheDocument();
  });

  test('shows a failure message and an optional detail message', () => {
    render(<PaymentCard status="failed" message="Card declined" />);
    expect(screen.getByText(/payment failed/i)).toBeInTheDocument();
    expect(screen.getByText('Card declined')).toBeInTheDocument();
  });

  test('exposes the status as an accessible live region', () => {
    render(<PaymentCard status="processing" />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });
});
