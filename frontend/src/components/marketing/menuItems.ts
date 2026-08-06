/**
 * Static mock menu data for the marketing carousel.
 * NO API fetch — this is SSR-safe static content used purely for demonstration.
 *
 * PLACEHOLDER NOTE: imageUrl values are Unsplash URLs with specific photo IDs.
 * Replace with real product photography (transparent-bg PNG/WebP) before launch.
 * Search "// PLACEHOLDER:" in this file and in the components that consume it.
 */

export interface MenuItem {
  id: string
  name: string
  tagline: string
  calories: number
  price: number          // in INR (₹)
  flavours: string[]
  imageUrl: string       // PLACEHOLDER: Unsplash URL — swap with real asset
  nutritionLabel: string // Short string shown on inactive card
  badge?: string         // Optional badge (e.g. "Best Seller", "New")
}

export const menuItems: MenuItem[] = [
  {
    id: 'signature-french-vanilla',
    name: 'Signature French Vanilla',
    tagline: 'Smooth & sweet with a creamy vanilla finish',
    calories: 250,
    price: 299,
    flavours: ['Classic Vanilla', 'Hazelnut Vanilla', 'Caramel Vanilla'],
    // PLACEHOLDER: replace with your actual product image (transparent PNG preferred)
    imageUrl:
      'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&q=80&fm=webp',
    nutritionLabel: '250 cal · 8g fat',
    badge: 'Best Seller',
  },
  {
    id: 'handcrafted-latte',
    name: 'Handcrafted Latte',
    tagline: 'Artisan espresso shots in velvety steamed milk',
    calories: 190,
    price: 349,
    flavours: ['Vanilla Bean', 'Caramel', 'Hazelnut', 'Classic'],
    // PLACEHOLDER: replace with your actual product image (transparent PNG preferred)
    imageUrl:
      'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=600&q=80&fm=webp',
    nutritionLabel: '190 cal · 7g fat',
    badge: 'Fan Favourite',
  },
  {
    id: 'dark-chocolate-mocha',
    name: 'Dark Chocolate Mocha',
    tagline: 'Rich espresso blended with dark Belgian chocolate',
    calories: 310,
    price: 379,
    flavours: ['Dark Chocolate', 'Mint Chocolate', 'White Chocolate'],
    // PLACEHOLDER: replace with your actual product image (transparent PNG preferred)
    imageUrl:
      'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=600&q=80&fm=webp',
    nutritionLabel: '310 cal · 12g fat',
    badge: 'New',
  },
  {
    id: 'canadian-cappuccino',
    name: 'Canadian Cappuccino',
    tagline: 'Bold espresso crowned with thick microfoam',
    calories: 180,
    price: 319,
    flavours: ['Original', 'Cinnamon', 'Maple'],
    // PLACEHOLDER: replace with your actual product image (transparent PNG preferred)
    imageUrl:
      'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=600&q=80&fm=webp',
    nutritionLabel: '180 cal · 6g fat',
  },
]
