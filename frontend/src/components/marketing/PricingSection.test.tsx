import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import PricingSection from './PricingSection';

describe('PricingSection', () => {
  test('renders as its own #pricing anchor target with no fabricated numbers', () => {
    const { container } = render(<PricingSection />);

    expect(container.querySelector('section#pricing')).toBeInTheDocument();
    // No real plan data exists yet — this must not invent a price/plan name.
    expect(screen.queryByText(/\$|₹|\/mo|\/month|per month/i)).not.toBeInTheDocument();
  });

  test('points visitors to the contact section instead of a fabricated price', () => {
    render(<PricingSection />);

    expect(screen.getByRole('link', { name: /get in touch/i })).toHaveAttribute('href', '/#contact');
  });
});
