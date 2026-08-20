import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomePage from './page';

vi.mock('@/components/marketing/LandingHero', () => ({
  default: () => <section aria-label="Landing hero" />,
}));

describe('HomePage', () => {
  test('renders the About and Contact sections below the landing hero', () => {
    render(<HomePage />);

    expect(screen.getByRole('region', { name: 'About nextBooq' })).toHaveAttribute('id', 'about');
    expect(screen.getByRole('region', { name: 'Get in Touch' })).toHaveAttribute('id', 'contact');
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });
});
