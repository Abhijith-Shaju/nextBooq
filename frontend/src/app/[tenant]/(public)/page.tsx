import React from 'react'
import Link from 'next/link'
import { Coffee } from 'lucide-react'

/**
 * [tenant]/(public) — Customer-facing public page for a specific café.
 * This is a stub. The real implementation will show the café's menu,
 * available time slots, and a booking form.
 */
interface Props {
  params: Promise<{ tenant: string }>
}

export default async function TenantPublicPage({ params }: Props) {
  const { tenant } = await params

  return (
    <div className="min-h-screen bg-brand-cream flex flex-col items-center justify-center px-4 text-center">
      <div className="space-y-6 max-w-md">
        <div className="flex items-center justify-center gap-2">
          <div className="w-10 h-10 bg-brand-red rounded-xl flex items-center justify-center">
            <Coffee className="w-5 h-5 text-white" />
          </div>
          <span className="font-display font-bold text-2xl text-brand-brown capitalize">
            {tenant}
          </span>
        </div>
        <h1 className="font-display text-4xl font-bold text-brand-brown">Welcome!</h1>
        <p className="font-sans text-brand-mocha">
          This is the public booking page for <strong>{tenant}</strong>.
          The full café menu and reservation flow will be available here.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-brand-red font-semibold hover:underline"
        >
          ← Back to nextBooq
        </Link>
      </div>
    </div>
  )
}
