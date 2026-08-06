import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Brand palette ────────────────────────────────────────────────────────
        // Warm-red / cream coffee shop palette. Consume via className (e.g.
        // bg-brand-red, text-brand-brown) — do NOT hardcode hex values inline.
        brand: {
          red:       '#C8102E', // Warm crimson – primary CTA, active card bg
          redDark:   '#9B0D21', // Deeper crimson – gradient overlay, hover states
          redLight:  '#E8415A', // Lighter rose-red – highlights, hover on pills
          cream:     '#FDFBF7', // Page background off-white
          tan:       '#F5ECD7', // Warm tan – secondary card surfaces
          blush:     '#F2C4C4', // Pastel rose – decorative blob fills
          blushLight:'#FAE8E8', // Even lighter blush – blob gradient stops
          brown:     '#2C1810', // Espresso dark – headings
          mocha:     '#7A5C3E', // Warm mid-brown – body text
          mochaMid:  '#9C7A5A', // Lighter mocha – muted/secondary text
          gold:      '#D4A853', // Warm gold – accent star/rating icons
        },
        // ── shadcn/ui semantic aliases (mapped to CSS vars set in globals.css) ──
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      fontFamily: {
        // Loaded via next/font — CSS vars injected by root layout.tsx
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        'brand-sm': '0 2px 8px rgba(200, 16, 46, 0.15)',
        'brand-md': '0 4px 20px rgba(200, 16, 46, 0.25)',
        'brand-lg': '0 8px 40px rgba(200, 16, 46, 0.30)',
        'brand-xl': '0 16px 60px rgba(155, 13, 33, 0.35)',
        'card-glass': '0 4px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.6)',
        'hero-img': '0 24px 60px rgba(44, 24, 16, 0.25)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #C8102E 0%, #9B0D21 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, #E8415A 0%, #C8102E 60%, #9B0D21 100%)',
        'cream-gradient': 'linear-gradient(180deg, #FDFBF7 0%, #F5ECD7 100%)',
        'glass-shine': 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.05) 100%)',
      },
      keyframes: {
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        'blob-pulse': {
          '0%, 100%': { transform: 'scale(1) rotate(0deg)' },
          '33%': { transform: 'scale(1.05) rotate(3deg)' },
          '66%': { transform: 'scale(0.97) rotate(-2deg)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'float': 'float 4s ease-in-out infinite',
        'blob-pulse': 'blob-pulse 8s ease-in-out infinite',
        'fade-up': 'fade-up 0.6s ease-out both',
      },
    },
  },
  plugins: [],
}

export default config
