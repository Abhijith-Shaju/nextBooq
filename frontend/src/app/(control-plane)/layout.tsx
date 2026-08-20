import React from 'react'
import MarketingHeader from '@/components/marketing/MarketingHeader'
import MarketingFooter from '@/components/marketing/MarketingFooter'
import { EmailVerificationBanner } from '@/components/shared/email-verification-banner'

/**
 * Control-plane layout shell.
 * Wraps all marketing pages with the shared Header + Footer.
 * Do NOT add auth checks or data fetching here — this is a marketing-only route group.
 */
export default function ControlPlaneLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <MarketingHeader />
      <EmailVerificationBanner className="sticky top-16 md:top-20 z-40" />
      <div className="flex flex-col min-h-screen">
        {children}
      </div>
      <MarketingFooter />
    </>
  )
}
