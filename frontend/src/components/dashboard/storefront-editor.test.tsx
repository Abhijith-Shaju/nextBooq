import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { StorefrontEditor } from './storefront-editor';
import { CafeMenuCategory } from '@/lib/types/models';

const noop = () => {};

describe('StorefrontEditor', () => {
  test('renders the current description and hero image URL', () => {
    render(
      <StorefrontEditor
        description="A cozy cafe."
        heroImageUrl="https://example.com/hero.jpg"
        menu={[]}
        onDescriptionChange={noop}
        onHeroImageUrlChange={noop}
        onMenuChange={noop}
      />
    );

    expect(screen.getByLabelText(/description/i)).toHaveValue('A cozy cafe.');
    expect(screen.getByLabelText(/hero photo url/i)).toHaveValue('https://example.com/hero.jpg');
  });

  test('typing in the description field calls onDescriptionChange', () => {
    const onDescriptionChange = vi.fn();
    render(
      <StorefrontEditor
        description=""
        heroImageUrl=""
        menu={[]}
        onDescriptionChange={onDescriptionChange}
        onHeroImageUrlChange={noop}
        onMenuChange={noop}
      />
    );

    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'New description' } });

    expect(onDescriptionChange).toHaveBeenCalledWith('New description');
  });

  test('adding a category calls onMenuChange with a new empty category appended', () => {
    const onMenuChange = vi.fn();
    render(
      <StorefrontEditor
        description=""
        heroImageUrl=""
        menu={[]}
        onDescriptionChange={noop}
        onHeroImageUrlChange={noop}
        onMenuChange={onMenuChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /add category/i }));

    expect(onMenuChange).toHaveBeenCalledWith([{ category: '', items: [] }]);
  });

  test('adding an item to an existing category appends an empty item to that category only', () => {
    const menu: CafeMenuCategory[] = [
      { category: 'Coffee', items: [{ name: 'Espresso', price: 120 }] },
      { category: 'Snacks', items: [] },
    ];
    const onMenuChange = vi.fn();
    render(
      <StorefrontEditor
        description=""
        heroImageUrl=""
        menu={menu}
        onDescriptionChange={noop}
        onHeroImageUrlChange={noop}
        onMenuChange={onMenuChange}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: /add item/i })[0]);

    expect(onMenuChange).toHaveBeenCalledWith([
      { category: 'Coffee', items: [{ name: 'Espresso', price: 120 }, { name: '', description: '', price: undefined }] },
      { category: 'Snacks', items: [] },
    ]);
  });

  test('removing a category calls onMenuChange without that category', () => {
    const menu: CafeMenuCategory[] = [
      { category: 'Coffee', items: [] },
      { category: 'Snacks', items: [] },
    ];
    const onMenuChange = vi.fn();
    render(
      <StorefrontEditor
        description=""
        heroImageUrl=""
        menu={menu}
        onDescriptionChange={noop}
        onHeroImageUrlChange={noop}
        onMenuChange={onMenuChange}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: /remove category/i })[0]);

    expect(onMenuChange).toHaveBeenCalledWith([{ category: 'Snacks', items: [] }]);
  });

  test('editing an item name calls onMenuChange with only that item updated', () => {
    const menu: CafeMenuCategory[] = [{ category: 'Coffee', items: [{ name: 'Espresso', price: 120 }] }];
    const onMenuChange = vi.fn();
    render(
      <StorefrontEditor
        description=""
        heroImageUrl=""
        menu={menu}
        onDescriptionChange={noop}
        onHeroImageUrlChange={noop}
        onMenuChange={onMenuChange}
      />
    );

    fireEvent.change(screen.getByDisplayValue('Espresso'), { target: { value: 'Cappuccino' } });

    expect(onMenuChange).toHaveBeenCalledWith([
      { category: 'Coffee', items: [{ name: 'Cappuccino', price: 120 }] },
    ]);
  });

  test('shows a warning instead of a broken image when the hero photo URL fails to load', () => {
    render(
      <StorefrontEditor
        description=""
        heroImageUrl="https://www.google.com/imgres?imgurl=https://cdn.pixabay.com/photo.jpg"
        menu={[]}
        onDescriptionChange={noop}
        onHeroImageUrlChange={noop}
        onMenuChange={noop}
      />
    );

    fireEvent.error(screen.getByAltText('Hero preview'));

    expect(screen.queryByAltText('Hero preview')).not.toBeInTheDocument();
    expect(screen.getByText(/doesn't look like a direct image link/i)).toBeInTheDocument();
  });

  test('clears the warning once a new, working URL is entered', () => {
    const { rerender } = render(
      <StorefrontEditor
        description=""
        heroImageUrl="https://example.com/broken.jpg"
        menu={[]}
        onDescriptionChange={noop}
        onHeroImageUrlChange={noop}
        onMenuChange={noop}
      />
    );

    fireEvent.error(screen.getByAltText('Hero preview'));
    expect(screen.getByText(/doesn't look like a direct image link/i)).toBeInTheDocument();

    rerender(
      <StorefrontEditor
        description=""
        heroImageUrl="https://example.com/working.jpg"
        menu={[]}
        onDescriptionChange={noop}
        onHeroImageUrlChange={noop}
        onMenuChange={noop}
      />
    );

    expect(screen.queryByText(/doesn't look like a direct image link/i)).not.toBeInTheDocument();
    expect(screen.getByAltText('Hero preview')).toBeInTheDocument();
  });
});
