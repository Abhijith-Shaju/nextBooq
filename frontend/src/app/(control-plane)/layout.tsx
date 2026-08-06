import React from 'react'
import MarketingHeader from '@/components/marketing/MarketingHeader'
import MarketingFooter from '@/components/marketing/MarketingFooter'

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
      <div className="flex flex-col min-h-screen">
        {children}
      </div>
      <MarketingFooter />
    </>
  )
}
