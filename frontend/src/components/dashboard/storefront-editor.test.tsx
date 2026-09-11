import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { StorefrontEditor } from './storefront-editor';
import { CafeMenuCategory } from '@/lib/types/models';
import { DEFAULT_TENANT_THEME } from '@/lib/theme/resolve-tenant-theme';

const noop = () => {};

describe('StorefrontEditor', () => {
  test('renders the current description, hero image URL, and contact phone', () => {
    render(
      <StorefrontEditor
        description="A cozy cafe."
        heroImageUrl="https://example.com/hero.jpg"
        heroOverlay="balanced"
        onHeroOverlayChange={noop}
        menu={[]}
        onDescriptionChange={noop}
        contactPhone="+91 98765 43210"
        onHeroImageUrlChange={noop}
        onContactPhoneChange={noop}
        logoUrl=""
        brandPrimary=""
        brandAccent=""
        onLogoUrlChange={noop}
        onBrandPrimaryChange={noop}
        onBrandAccentChange={noop}
        onMenuChange={noop}
      />
    );

    expect(screen.getByLabelText(/description/i)).toHaveValue('A cozy cafe.');
    expect(screen.getByLabelText(/hero photo url/i)).toHaveValue('https://example.com/hero.jpg');
    expect(screen.getByLabelText(/contact phone/i)).toHaveValue('+91 98765 43210');
  });

  test('typing in the contact phone field calls onContactPhoneChange', () => {
    const onContactPhoneChange = vi.fn();
    render(
      <StorefrontEditor
        description=""
        heroImageUrl=""
        heroOverlay="balanced"
        onHeroOverlayChange={noop}
        menu={[]}
        onDescriptionChange={noop}
        contactPhone=""
        onHeroImageUrlChange={noop}
        onContactPhoneChange={onContactPhoneChange}
        logoUrl=""
        brandPrimary=""
        brandAccent=""
        onLogoUrlChange={noop}
        onBrandPrimaryChange={noop}
        onBrandAccentChange={noop}
        onMenuChange={noop}
      />
    );

    fireEvent.change(screen.getByLabelText(/contact phone/i), { target: { value: '+91 98765 43210' } });

    expect(onContactPhoneChange).toHaveBeenCalledWith('+91 98765 43210');
  });

  test('typing in the description field calls onDescriptionChange', () => {
    const onDescriptionChange = vi.fn();
    render(
      <StorefrontEditor
        description=""
        heroImageUrl=""
        heroOverlay="balanced"
        onHeroOverlayChange={noop}
        menu={[]}
        onDescriptionChange={onDescriptionChange}
        contactPhone=""
        onHeroImageUrlChange={noop}
        onContactPhoneChange={noop}
        logoUrl=""
        brandPrimary=""
        brandAccent=""
        onLogoUrlChange={noop}
        onBrandPrimaryChange={noop}
        onBrandAccentChange={noop}
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
        heroOverlay="balanced"
        onHeroOverlayChange={noop}
        menu={[]}
        onDescriptionChange={noop}
        contactPhone=""
        onHeroImageUrlChange={noop}
        onContactPhoneChange={noop}
        logoUrl=""
        brandPrimary=""
        brandAccent=""
        onLogoUrlChange={noop}
        onBrandPrimaryChange={noop}
        onBrandAccentChange={noop}
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
        heroOverlay="balanced"
        onHeroOverlayChange={noop}
        menu={menu}
        onDescriptionChange={noop}
        contactPhone=""
        onHeroImageUrlChange={noop}
        onContactPhoneChange={noop}
        logoUrl=""
        brandPrimary=""
        brandAccent=""
        onLogoUrlChange={noop}
        onBrandPrimaryChange={noop}
        onBrandAccentChange={noop}
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
        heroOverlay="balanced"
        onHeroOverlayChange={noop}
        menu={menu}
        onDescriptionChange={noop}
        contactPhone=""
        onHeroImageUrlChange={noop}
        onContactPhoneChange={noop}
        logoUrl=""
        brandPrimary=""
        brandAccent=""
        onLogoUrlChange={noop}
        onBrandPrimaryChange={noop}
        onBrandAccentChange={noop}
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
        heroOverlay="balanced"
        onHeroOverlayChange={noop}
        menu={menu}
        onDescriptionChange={noop}
        contactPhone=""
        onHeroImageUrlChange={noop}
        onContactPhoneChange={noop}
        logoUrl=""
        brandPrimary=""
        brandAccent=""
        onLogoUrlChange={noop}
        onBrandPrimaryChange={noop}
        onBrandAccentChange={noop}
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
        heroOverlay="balanced"
        onHeroOverlayChange={noop}
        menu={[]}
        onDescriptionChange={noop}
        contactPhone=""
        onHeroImageUrlChange={noop}
        onContactPhoneChange={noop}
        logoUrl=""
        brandPrimary=""
        brandAccent=""
        onLogoUrlChange={noop}
        onBrandPrimaryChange={noop}
        onBrandAccentChange={noop}
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
        heroOverlay="balanced"
        onHeroOverlayChange={noop}
        menu={[]}
        onDescriptionChange={noop}
        contactPhone=""
        onHeroImageUrlChange={noop}
        onContactPhoneChange={noop}
        logoUrl=""
        brandPrimary=""
        brandAccent=""
        onLogoUrlChange={noop}
        onBrandPrimaryChange={noop}
        onBrandAccentChange={noop}
        onMenuChange={noop}
      />
    );

    fireEvent.error(screen.getByAltText('Hero preview'));
    expect(screen.getByText(/doesn't look like a direct image link/i)).toBeInTheDocument();

    rerender(
      <StorefrontEditor
        description=""
        heroImageUrl="https://example.com/working.jpg"
        heroOverlay="balanced"
        onHeroOverlayChange={noop}
        menu={[]}
        onDescriptionChange={noop}
        contactPhone=""
        onHeroImageUrlChange={noop}
        onContactPhoneChange={noop}
        logoUrl=""
        brandPrimary=""
        brandAccent=""
        onLogoUrlChange={noop}
        onBrandPrimaryChange={noop}
        onBrandAccentChange={noop}
        onMenuChange={noop}
      />
    );

    expect(screen.queryByText(/doesn't look like a direct image link/i)).not.toBeInTheDocument();
    expect(screen.getByAltText('Hero preview')).toBeInTheDocument();
  });
});

describe('StorefrontEditor hero overlay preset', () => {
  test('highlights the currently selected preset and calls onHeroOverlayChange for another', () => {
    const onHeroOverlayChange = vi.fn();
    render(
      <StorefrontEditor
        description=""
        heroImageUrl=""
        heroOverlay="subtle"
        onHeroOverlayChange={onHeroOverlayChange}
        menu={[]}
        onDescriptionChange={noop}
        contactPhone=""
        onHeroImageUrlChange={noop}
        onContactPhoneChange={noop}
        logoUrl=""
        brandPrimary=""
        brandAccent=""
        onLogoUrlChange={noop}
        onBrandPrimaryChange={noop}
        onBrandAccentChange={noop}
        onMenuChange={noop}
      />
    );

    expect(screen.getByRole('button', { name: 'Subtle' })).toHaveClass('bg-brand-red');
    expect(screen.getByRole('button', { name: 'Vivid' })).not.toHaveClass('bg-brand-red');

    fireEvent.click(screen.getByRole('button', { name: 'Vivid' }));
    expect(onHeroOverlayChange).toHaveBeenCalledWith('vivid');
  });
});

describe('StorefrontEditor hero colours', () => {
  test('shows saved hero tint and text colours', () => {
    render(
      <StorefrontEditor
        description=""
        heroImageUrl=""
        heroOverlay="balanced"
        heroTintColor="#153A2E"
        heroTextColor="#FFF4D8"
        onHeroOverlayChange={noop}
        onHeroTintColorChange={noop}
        onHeroTextColorChange={noop}
        contactPhone=""
        logoUrl=""
        brandPrimary=""
        brandAccent=""
        menu={[]}
        onDescriptionChange={noop}
        onHeroImageUrlChange={noop}
        onContactPhoneChange={noop}
        onLogoUrlChange={noop}
        onBrandPrimaryChange={noop}
        onBrandAccentChange={noop}
        onMenuChange={noop}
      />
    );

    expect(screen.getByLabelText(/hero tint colour hex/i)).toHaveValue('#153A2E');
    expect(screen.getByLabelText(/hero text colour hex/i)).toHaveValue('#FFF4D8');
  });

  test('changing hero colours reports the new values upward', () => {
    const onHeroTintColorChange = vi.fn();
    const onHeroTextColorChange = vi.fn();
    render(
      <StorefrontEditor
        description=""
        heroImageUrl=""
        heroOverlay="balanced"
        heroTintColor=""
        heroTextColor=""
        onHeroOverlayChange={noop}
        onHeroTintColorChange={onHeroTintColorChange}
        onHeroTextColorChange={onHeroTextColorChange}
        contactPhone=""
        logoUrl=""
        brandPrimary=""
        brandAccent=""
        menu={[]}
        onDescriptionChange={noop}
        onHeroImageUrlChange={noop}
        onContactPhoneChange={noop}
        onLogoUrlChange={noop}
        onBrandPrimaryChange={noop}
        onBrandAccentChange={noop}
        onMenuChange={noop}
      />
    );

    fireEvent.change(screen.getByLabelText(/hero tint colour hex/i), {
      target: { value: '#153A2E' },
    });
    fireEvent.change(screen.getByLabelText(/hero text colour hex/i), {
      target: { value: '#FFF4D8' },
    });

    expect(onHeroTintColorChange).toHaveBeenCalledWith('#153A2E');
    expect(onHeroTextColorChange).toHaveBeenCalledWith('#FFF4D8');
  });
});

describe('StorefrontEditor branding', () => {
  const renderBranding = (props: Record<string, unknown> = {}) =>
    render(
      <StorefrontEditor
        description=""
        heroImageUrl=""
        heroOverlay="balanced"
        onHeroOverlayChange={noop}
        contactPhone=""
        logoUrl=""
        brandPrimary=""
        brandAccent=""
        menu={[]}
        onDescriptionChange={noop}
        onHeroImageUrlChange={noop}
        onContactPhoneChange={noop}
        onLogoUrlChange={noop}
        onBrandPrimaryChange={noop}
        onBrandAccentChange={noop}
        onMenuChange={noop}
        {...props}
      />
    );

  test('shows the saved logo and brand colours', () => {
    renderBranding({
      logoUrl: 'https://example.com/logo.png',
      brandPrimary: '#1B7F5A',
      brandAccent: '#E4A11B',
    });

    expect(screen.getByLabelText(/logo url/i)).toHaveValue('https://example.com/logo.png');
    expect(screen.getByAltText('Logo preview')).toBeInTheDocument();
    expect(screen.getByLabelText(/primary brand colour hex/i)).toHaveValue('#1B7F5A');
    expect(screen.getByLabelText(/accent brand colour hex/i)).toHaveValue('#E4A11B');
  });

  test('an unset brand colour leaves the text field empty but shows the platform default in the swatch', () => {
    renderBranding();

    expect(screen.getByLabelText(/primary brand colour hex/i)).toHaveValue('');
    // A colour input cannot render "empty", so it falls back to the default
    // rather than showing an arbitrary black swatch.
    expect(screen.getByLabelText(/^primary brand colour$/i)).toHaveValue(
      DEFAULT_TENANT_THEME.brandPrimary.toLowerCase()
    );
  });

  test('typing a hex value reports it upward', () => {
    const onBrandPrimaryChange = vi.fn();
    renderBranding({ onBrandPrimaryChange });

    fireEvent.change(screen.getByLabelText(/primary brand colour hex/i), {
      target: { value: '#123ABC' },
    });

    expect(onBrandPrimaryChange).toHaveBeenCalledWith('#123ABC');
  });

  test('reset clears the override so the cafe returns to the default palette', () => {
    const onBrandAccentChange = vi.fn();
    renderBranding({ brandAccent: '#E4A11B', onBrandAccentChange });

    fireEvent.click(screen.getByTitle(/reset accent to the default/i));

    expect(onBrandAccentChange).toHaveBeenCalledWith('');
  });

  test('offers no reset control while a colour is still unset', () => {
    renderBranding();

    expect(screen.queryByTitle(/reset primary to the default/i)).not.toBeInTheDocument();
  });

  test('warns when the logo URL does not resolve to an image', () => {
    renderBranding({ logoUrl: 'https://example.com/not-an-image' });

    fireEvent.error(screen.getByAltText('Logo preview'));

    expect(screen.getByText(/doesn't look like a direct image link/i)).toBeInTheDocument();
  });
});
