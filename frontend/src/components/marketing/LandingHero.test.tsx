import React from 'react';
import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import LandingHero from './LandingHero';

describe('LandingHero', () => {
  test('does not display unverified venue, rating, or customer-count claims', () => {
    render(<LandingHero />);

    expect(screen.queryByText(/now serving.*200\+ venues/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/4\.9.*average rating/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/50k\+.*happy customers/i)).not.toBeInTheDocument();
  });
});
