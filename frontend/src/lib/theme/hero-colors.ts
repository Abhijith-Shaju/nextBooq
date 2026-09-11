export const DEFAULT_HERO_TINT_COLOR = '#2C1810';
export const DEFAULT_HERO_TEXT_COLOR = '#FFFFFF';

export function resolveHeroTintColor(value?: string) {
  return value || DEFAULT_HERO_TINT_COLOR;
}

export function resolveHeroTextColor(value?: string) {
  return value || DEFAULT_HERO_TEXT_COLOR;
}
