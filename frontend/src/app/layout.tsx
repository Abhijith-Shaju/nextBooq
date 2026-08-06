import type { Metadata } from 'next'
import { Playfair_Display, DM_Sans } from 'next/font/google'
import './globals.css'

// ─── Typography ───────────────────────────────────────────────────────────────
// Display / serif font for hero headlines and section titles
const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
})

// Body / UI sans-serif font
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

// ─── Site Metadata ────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: {
    default: 'nextBooq — Café Reservation Platform for Modern Businesses',
    template: '%s | nextBooq',
  },
  description:
    'nextBooq is a multi-tenant SaaS platform that helps cafés and restaurants manage reservations, menus, and customer experiences — all in one place.',
  keywords: ['cafe reservation', 'restaurant booking', 'SaaS', 'table management', 'nextBooq'],
  authors: [{ name: 'nextBooq Team' }],
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    siteName: 'nextBooq',
    title: 'nextBooq — Café Reservation Platform',
    description: 'Manage reservations, menus, and customer experiences for your café with nextBooq.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'nextBooq — Café Reservation Platform',
    description: 'Manage reservations, menus, and customer experiences for your café with nextBooq.',
  },
}

// ─── Root Layout ──────────────────────────────────────────────────────────────
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${playfairDisplay.variable} ${dmSans.variable}`} data-scroll-behavior="smooth">
      <body className="font-sans antialiased bg-brand-cream text-brand-brown">
        {children}
      </body>
    </html>
  )
}
