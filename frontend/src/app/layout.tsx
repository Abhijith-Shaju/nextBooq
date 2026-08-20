import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { QueryProvider } from "@/components/providers/query-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { Toaster } from "@/components/ui/sonner";
import { EmailVerificationBanner } from "@/components/shared/email-verification-banner";

// Self-hosted (not next/font/google) so dev/build never depends on reaching
// fonts.gstatic.com over the network — that dependency was causing
// `Module not found` / connection-refused failures on networks that can't
// reach Google's font CDN (corporate proxies, offline dev, flaky DNS).
// Files are the latin-subset woff2s Google itself serves for these
// families/weights; re-fetch via `frontend/scripts/fetch-fonts.sh` if a
// family/weight changes.
const inter = localFont({
  src: "./fonts/inter-variable.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});
const spaceGrotesk = localFont({
  src: "./fonts/space-grotesk-variable.woff2",
  weight: "500 700",
  variable: "--font-display",
  display: "swap",
});
const spaceMono = localFont({
  src: [
    { path: "./fonts/space-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/space-mono-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "nextBooq",
  description: "Restaurant reservations made easy",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${spaceGrotesk.variable} ${spaceMono.variable} font-sans`}>
        <QueryProvider>
          <AuthProvider>
            <EmailVerificationBanner />
            {children}
            <Toaster richColors position="top-center" />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
