import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-playfair)", "var(--font-display)", "Georgia", "serif"],
      },
      colors: {
        brand: {
          DEFAULT: "hsl(var(--brand-primary))",
          foreground: "hsl(var(--brand-primary-foreground))",
          accent: "hsl(var(--brand-accent))",
          "accent-foreground": "hsl(var(--brand-accent-foreground))",
          red: "#C8102E",
          redDark: "#9B0D21",
          redLight: "#E8415A",
          cream: "#FDFBF7",
          tan: "#F5ECD7",
          blush: "#F2C4C4",
          blushLight: "#FAE8E8",
          brown: "#2C1810",
          mocha: "#7A5C3E",
          mochaMid: "#9C7A5A",
          gold: "#D4A853",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        card: "0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.07)",
        "card-hover":
          "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
        luxury: "0 25px 50px -12px rgb(0 0 0 / 0.25)",
        "brand-sm": "0 2px 8px rgba(200, 16, 46, 0.15)",
        "brand-md": "0 4px 20px rgba(200, 16, 46, 0.25)",
        "brand-lg": "0 8px 40px rgba(200, 16, 46, 0.30)",
        "brand-xl": "0 16px 60px rgba(155, 13, 33, 0.35)",
        "card-glass": "0 4px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.6)",
        "hero-img": "0 24px 60px rgba(44, 24, 16, 0.25)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #C8102E 0%, #9B0D21 100%)",
        "brand-gradient-soft": "linear-gradient(135deg, #E8415A 0%, #C8102E 60%, #9B0D21 100%)",
        "cream-gradient": "linear-gradient(180deg, #FDFBF7 0%, #F5ECD7 100%)",
        "glass-shine": "linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.05) 100%)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        "blob-pulse": {
          "0%, 100%": { transform: "scale(1) rotate(0deg)" },
          "33%": { transform: "scale(1.05) rotate(3deg)" },
          "66%": { transform: "scale(0.97) rotate(-2deg)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shimmer: "shimmer 2s linear infinite",
        "fade-in": "fade-in 0.4s ease-out forwards",
        "scale-in": "scale-in 0.3s ease-out forwards",
        float: "float 4s ease-in-out infinite",
        "blob-pulse": "blob-pulse 8s ease-in-out infinite",
        "fade-up": "fade-up 0.6s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
