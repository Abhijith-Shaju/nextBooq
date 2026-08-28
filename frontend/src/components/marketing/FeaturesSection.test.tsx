import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import FeaturesSection from './FeaturesSection';

describe('FeaturesSection', () => {
  test('renders as its own #features anchor target, separate from the hero', () => {
    const { container } = render(<FeaturesSection />);

    const section = container.querySelector('section#features');
    expect(section).toBeInTheDocument();
  });

  test('renders all four owner-facing features with descriptions', () => {
    render(<FeaturesSection />);

    expect(screen.getByText('Live Table View')).toBeInTheDocument();
    expect(screen.getByText('Instant Confirmation')).toBeInTheDocument();
    expect(screen.getByText('Secure Razorpay Payouts')).toBeInTheDocument();
    expect(screen.getByText('No-Show Protection')).toBeInTheDocument();
    expect(screen.getByText(/never has to guess/i)).toBeInTheDocument();
  });
});
