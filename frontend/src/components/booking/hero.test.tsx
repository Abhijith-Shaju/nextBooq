import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Hero } from './hero';
import { useTenant } from '@/components/providers/tenant-provider';

vi.mock('@/components/providers/tenant-provider', () => ({
  useTenant: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () => (props: any) => <div {...props} />,
    }
  ),
}));

const baseCafe = {
  id: 'cafe_1',
  slug: 'demo-cafe',
  name: 'Demo Cafe',
  timezone: 'UTC',
  reservation_rules: {},
};

describe('Hero', () => {
  test('renders the cafe\'s actual description when set', () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: { ...baseCafe, description: 'The best filter coffee in town.' },
    } as any);
    render(<Hero />);

    expect(screen.getByText('The best filter coffee in town.')).toBeInTheDocument();
  });

  test('falls back to a generic sentence when no description is set', () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: { ...baseCafe } } as any);
    render(<Hero />);

    expect(screen.getByText(/effortless table reservations/i)).toBeInTheDocument();
  });

  test('renders the hero image when hero_image_url is set', () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: { ...baseCafe, hero_image_url: 'https://example.com/hero.jpg' },
    } as any);
    render(<Hero />);

    expect(screen.getByAltText('Demo Cafe')).toBeInTheDocument();
  });

  test('renders no image element when hero_image_url is not set', () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: { ...baseCafe } } as any);
    render(<Hero />);

    expect(screen.queryByAltText('Demo Cafe')).not.toBeInTheDocument();
  });

  test('falls back to the gradient background when the hero image fails to load (e.g. a non-image URL)', () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: { ...baseCafe, hero_image_url: 'https://www.google.com/imgres?imgurl=https://cdn.pixabay.com/photo.jpg' },
    } as any);
    render(<Hero />);

    fireEvent.error(screen.getByAltText('Demo Cafe'));

    expect(screen.queryByAltText('Demo Cafe')).not.toBeInTheDocument();
    expect(screen.getByTestId('hero-gradient-fallback')).toBeInTheDocument();
  });

  test('defaults to the balanced (40%) overlay when hero_overlay is not set', () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: { ...baseCafe, hero_image_url: 'https://example.com/hero.jpg' },
    } as any);
    render(<Hero />);

    expect(screen.getByAltText('Demo Cafe')).toHaveClass('opacity-40');
  });

  test.each([
    ['subtle', 'opacity-25'],
    ['balanced', 'opacity-40'],
    ['vivid', 'opacity-60'],
  ])('applies the %s preset as %s', (hero_overlay, expectedClass) => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: { ...baseCafe, hero_image_url: 'https://example.com/hero.jpg', hero_overlay },
    } as any);
    render(<Hero />);

    expect(screen.getByAltText('Demo Cafe')).toHaveClass(expectedClass);
  });

  test('uses the cafe hero tint and text colours when set', () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: {
        ...baseCafe,
        hero_image_url: 'https://example.com/hero.jpg',
        hero_tint_color: '#153A2E',
        hero_text_color: '#FFF4D8',
      },
    } as any);
    render(<Hero />);

    expect(screen.getByTestId('storefront-hero')).toHaveStyle({
      backgroundColor: '#153A2E',
      color: '#FFF4D8',
    });
  });
});
