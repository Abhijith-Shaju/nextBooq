import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { CafeMenuSection } from './cafe-menu-section';
import { useTenant } from '@/components/providers/tenant-provider';
import { vi } from 'vitest';

vi.mock('@/components/providers/tenant-provider', () => ({
  useTenant: vi.fn(),
}));

const baseCafe = { id: 'cafe_1', slug: 'demo-cafe', name: 'Demo Cafe', timezone: 'UTC', reservation_rules: {} as any };

describe('CafeMenuSection', () => {
  test('renders nothing when the cafe has no menu', () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: { ...baseCafe, menu: [] } } as any);
    const { container } = render(<CafeMenuSection />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when menu is undefined', () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: { ...baseCafe } } as any);
    const { container } = render(<CafeMenuSection />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders categories and items when a menu is set', () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: {
        ...baseCafe,
        menu: [
          {
            category: 'Coffee',
            items: [
              { name: 'Espresso', description: 'Double shot', price: 120 },
              { name: 'Filter Coffee' },
            ],
          },
        ],
      },
    } as any);
    render(<CafeMenuSection />);

    expect(screen.getByText('Coffee')).toBeInTheDocument();
    expect(screen.getByText('Espresso')).toBeInTheDocument();
    expect(screen.getByText('Double shot')).toBeInTheDocument();
    expect(screen.getByText('₹120')).toBeInTheDocument();
    expect(screen.getByText('Filter Coffee')).toBeInTheDocument();
  });

  test('skips a category that has zero items', () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: {
        ...baseCafe,
        menu: [
          { category: 'Empty Category', items: [] },
          { category: 'Coffee', items: [{ name: 'Espresso', price: 120 }] },
        ],
      },
    } as any);
    render(<CafeMenuSection />);

    expect(screen.queryByText('Empty Category')).not.toBeInTheDocument();
    expect(screen.getByText('Coffee')).toBeInTheDocument();
  });

  test('does not show a price for an item with no price', () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: { ...baseCafe, menu: [{ category: 'Coffee', items: [{ name: 'Filter Coffee' }] }] },
    } as any);
    render(<CafeMenuSection />);

    expect(screen.getByText('Filter Coffee')).toBeInTheDocument();
    expect(screen.queryByText(/₹/)).not.toBeInTheDocument();
  });
});
