'use client';

import { useState } from 'react';
import { CafeMenuCategory, CafeMenuItem } from '@/lib/types/models';
import { Image as ImageIcon, Info, Palette, Phone, Plus, RotateCcw, Sparkles, Trash2, TriangleAlert, UtensilsCrossed } from 'lucide-react';
import { DEFAULT_TENANT_THEME } from '@/lib/theme/resolve-tenant-theme';

const DESCRIPTION_MAX_LENGTH = 1000;
const CONTACT_PHONE_MAX_LENGTH = 30;

type HeroOverlay = 'subtle' | 'balanced' | 'vivid';

const HERO_OVERLAY_OPTIONS: { value: HeroOverlay; label: string; hint: string }[] = [
  { value: 'subtle', label: 'Subtle', hint: '25% — photo barely visible' },
  { value: 'balanced', label: 'Balanced', hint: '40% — the default' },
  { value: 'vivid', label: 'Vivid', hint: '60% — most visible, still readable' },
];

interface StorefrontEditorProps {
  description: string;
  heroImageUrl: string;
  heroOverlay: HeroOverlay;
  contactPhone: string;
  logoUrl: string;
  brandPrimary: string;
  brandAccent: string;
  menu: CafeMenuCategory[];
  onDescriptionChange: (value: string) => void;
  onHeroImageUrlChange: (value: string) => void;
  onHeroOverlayChange: (value: HeroOverlay) => void;
  onContactPhoneChange: (value: string) => void;
  onLogoUrlChange: (value: string) => void;
  onBrandPrimaryChange: (value: string) => void;
  onBrandAccentChange: (value: string) => void;
  onMenuChange: (menu: CafeMenuCategory[]) => void;
}

const EMPTY_ITEM: CafeMenuItem = { name: '', description: '', price: undefined };

export function StorefrontEditor({
  description,
  heroImageUrl,
  heroOverlay,
  contactPhone,
  logoUrl,
  brandPrimary,
  brandAccent,
  menu,
  onDescriptionChange,
  onHeroImageUrlChange,
  onHeroOverlayChange,
  onContactPhoneChange,
  onLogoUrlChange,
  onBrandPrimaryChange,
  onBrandAccentChange,
  onMenuChange,
}: StorefrontEditorProps) {
  const [previewFailedFor, setPreviewFailedFor] = useState<string | null>(null);

  const addCategory = () => {
    onMenuChange([...menu, { category: '', items: [] }]);
  };

  const removeCategory = (categoryIndex: number) => {
    onMenuChange(menu.filter((_, i) => i !== categoryIndex));
  };

  const updateCategoryName = (categoryIndex: number, name: string) => {
    onMenuChange(menu.map((cat, i) => (i === categoryIndex ? { ...cat, category: name } : cat)));
  };

  const addItem = (categoryIndex: number) => {
    onMenuChange(
      menu.map((cat, i) => (i === categoryIndex ? { ...cat, items: [...cat.items, { ...EMPTY_ITEM }] } : cat))
    );
  };

  const removeItem = (categoryIndex: number, itemIndex: number) => {
    onMenuChange(
      menu.map((cat, i) =>
        i === categoryIndex ? { ...cat, items: cat.items.filter((_, j) => j !== itemIndex) } : cat
      )
    );
  };

  const updateItem = (categoryIndex: number, itemIndex: number, patch: Partial<CafeMenuItem>) => {
    onMenuChange(
      menu.map((cat, i) =>
        i === categoryIndex
          ? { ...cat, items: cat.items.map((item, j) => (j === itemIndex ? { ...item, ...patch } : item)) }
          : cat
      )
    );
  };

  return (
    <div className="pt-6 border-t border-brand-brown/10 space-y-6">
      <h2 className="text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
        <Info className="w-4 h-4 text-brand-red" /> Storefront
      </h2>
      <p className="text-[11px] text-brand-mochaMid -mt-4">
        Shown on your cafe's public page. Leave blank to keep the default look.
      </p>

      <div>
        <label htmlFor="storefront-description" className="block text-sm font-semibold text-brand-brown mb-1.5">
          Description
        </label>
        <textarea
          id="storefront-description"
          value={description}
          maxLength={DESCRIPTION_MAX_LENGTH}
          rows={3}
          onChange={(e) => onDescriptionChange(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm"
        />
        <p className="text-[11px] text-brand-mochaMid mt-1 text-right">
          {description.length}/{DESCRIPTION_MAX_LENGTH}
        </p>
      </div>

      <div>
        <label htmlFor="hero-image-url" className="text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
          <ImageIcon className="w-4 h-4 text-brand-red" /> Hero Photo URL
        </label>
        <input
          id="hero-image-url"
          type="text"
          value={heroImageUrl}
          onChange={(e) => onHeroImageUrlChange(e.target.value)}
          placeholder="https://..."
          className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm"
        />
        {heroImageUrl && previewFailedFor === heroImageUrl ? (
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            This doesn&apos;t look like a direct image link (a common mistake is copying a Google Images results
            page URL instead of the actual photo URL) — the hero photo won&apos;t show until it&apos;s fixed.
          </div>
        ) : (
          heroImageUrl && (
            // Same aspect-[8/3] + object-cover as the live storefront hero
            // (frontend/src/components/booking/hero.tsx) — so this preview
            // shows the actual crop the photo will get, not an unrelated
            // thumbnail shape.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={heroImageUrl}
              src={heroImageUrl}
              alt="Hero preview"
              onError={() => setPreviewFailedFor(heroImageUrl)}
              className="mt-2 aspect-[8/3] w-full max-w-sm rounded-xl object-cover border border-brand-brown/10"
            />
          )
        )}

        <div className="mt-3">
          <span className="block text-xs font-semibold text-brand-brown mb-1.5">Photo visibility</span>
          <div className="flex flex-wrap gap-2">
            {HERO_OVERLAY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onHeroOverlayChange(option.value)}
                title={option.hint}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  heroOverlay === option.value
                    ? 'border-brand-red bg-brand-red text-white'
                    : 'border-brand-brown/20 bg-white text-brand-mocha hover:border-brand-red/40'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-brand-mochaMid mt-1">
            How much of the photo shows through behind your headline text. Capped at a level that keeps the
            text readable.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="contact-phone" className="text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
          <Phone className="w-4 h-4 text-brand-red" /> Contact Phone
        </label>
        <input
          id="contact-phone"
          type="tel"
          value={contactPhone}
          maxLength={CONTACT_PHONE_MAX_LENGTH}
          onChange={(e) => onContactPhoneChange(e.target.value)}
          placeholder="+91 98765 43210"
          className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm"
        />
        <p className="text-[11px] text-brand-mochaMid mt-1">
          Shown to customers on your storefront so they can call with questions. Leave blank to hide it.
        </p>
      </div>

      <div>
        <label htmlFor="logo-url" className="text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-brand-red" /> Logo URL
        </label>
        <input
          id="logo-url"
          type="text"
          value={logoUrl}
          onChange={(e) => onLogoUrlChange(e.target.value)}
          placeholder="https://..."
          className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm"
        />
        {logoUrl && previewFailedFor === logoUrl ? (
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            This doesn&apos;t look like a direct image link — your logo won&apos;t show until it&apos;s fixed.
          </div>
        ) : (
          logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={logoUrl}
              src={logoUrl}
              alt="Logo preview"
              onError={() => setPreviewFailedFor(logoUrl)}
              className="mt-2 h-12 w-auto max-w-[160px] rounded-lg object-contain border border-brand-brown/10 bg-white p-1.5"
            />
          )
        )}
        <p className="text-[11px] text-brand-mochaMid mt-1">
          Replaces the coffee-cup mark in your storefront header. Leave blank to keep the default.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
          <Palette className="w-4 h-4 text-brand-red" /> Brand Colours
        </h3>
        <p className="text-[11px] text-brand-mochaMid mb-3">
          Recolours your whole storefront — buttons, highlights and the booking flow. Leave either one
          blank to stay on the nextBooq palette.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            {
              id: 'brand-primary',
              label: 'Primary',
              hint: 'Buttons and calls to action',
              value: brandPrimary,
              onChange: onBrandPrimaryChange,
              fallback: DEFAULT_TENANT_THEME.brandPrimary,
            },
            {
              id: 'brand-accent',
              label: 'Accent',
              hint: 'Holds, stamps and countdowns',
              value: brandAccent,
              onChange: onBrandAccentChange,
              fallback: DEFAULT_TENANT_THEME.brandAccent,
            },
          ].map((field) => (
            <div key={field.id}>
              <label htmlFor={field.id} className="block text-xs font-semibold text-brand-brown mb-1.5">
                {field.label}
              </label>
              <div className="flex items-center gap-2">
                {/* The colour input always needs a concrete value — showing the
                    platform default keeps the swatch meaningful while the
                    stored value is still empty (i.e. "not overridden"). */}
                <input
                  id={field.id}
                  type="color"
                  aria-label={`${field.label} brand colour`}
                  value={field.value || field.fallback}
                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                  className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-brand-brown/20 bg-white p-1"
                />
                <input
                  type="text"
                  aria-label={`${field.label} brand colour hex`}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  placeholder={field.fallback}
                  className="w-full px-3 py-2 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm font-mono uppercase"
                />
                {field.value && (
                  <button
                    type="button"
                    onClick={() => field.onChange('')}
                    title={`Reset ${field.label.toLowerCase()} to the default`}
                    className="p-2 rounded-lg text-brand-mocha hover:bg-brand-tan/40 transition-colors shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="text-[11px] text-brand-mochaMid mt-1">{field.hint}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-brand-brown mb-2 flex items-center gap-1.5">
          <UtensilsCrossed className="w-4 h-4 text-brand-red" /> Menu
        </h3>

        <div className="space-y-4">
          {menu.map((cat, categoryIndex) => (
            <div key={categoryIndex} className="rounded-xl border border-brand-brown/10 bg-white p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={cat.category}
                  placeholder="Category name (e.g. Coffee)"
                  aria-label={`Category ${categoryIndex + 1} name`}
                  onChange={(e) => updateCategoryName(categoryIndex, e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-brand-brown/20 bg-white text-sm font-semibold"
                />
                <button
                  type="button"
                  onClick={() => removeCategory(categoryIndex)}
                  aria-label={`Remove category ${cat.category || categoryIndex + 1}`}
                  className="p-2 rounded-lg text-rose-500 hover:bg-rose-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                {cat.items.map((item, itemIndex) => (
                  <div key={itemIndex} className="flex flex-wrap items-center gap-2 pl-4">
                    <input
                      type="text"
                      value={item.name}
                      placeholder="Item name"
                      aria-label={`Item ${itemIndex + 1} name in ${cat.category || 'category ' + (categoryIndex + 1)}`}
                      onChange={(e) => updateItem(categoryIndex, itemIndex, { name: e.target.value })}
                      className="flex-1 min-w-[8rem] px-3 py-2 rounded-lg border border-brand-brown/20 bg-white text-sm"
                    />
                    <input
                      type="text"
                      value={item.description || ''}
                      placeholder="Description (optional)"
                      aria-label={`Item ${itemIndex + 1} description in ${cat.category || 'category ' + (categoryIndex + 1)}`}
                      onChange={(e) => updateItem(categoryIndex, itemIndex, { description: e.target.value })}
                      className="flex-1 min-w-[8rem] px-3 py-2 rounded-lg border border-brand-brown/20 bg-white text-sm"
                    />
                    <input
                      type="number"
                      min={0}
                      value={item.price ?? ''}
                      placeholder="Price"
                      aria-label={`Item ${itemIndex + 1} price in ${cat.category || 'category ' + (categoryIndex + 1)}`}
                      onChange={(e) =>
                        updateItem(categoryIndex, itemIndex, {
                          price: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      className="w-24 px-3 py-2 rounded-lg border border-brand-brown/20 bg-white text-sm font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(categoryIndex, itemIndex)}
                      aria-label={`Remove item ${item.name || itemIndex + 1}`}
                      className="p-2 rounded-lg text-rose-500 hover:bg-rose-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => addItem(categoryIndex)}
                className="ml-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-red hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> Add item
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addCategory}
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-red hover:underline"
        >
          <Plus className="w-3.5 h-3.5" /> Add category
        </button>
      </div>
    </div>
  );
}
