import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Middleware stub — placeholder for tenant routing and auth guards.
 *
 * Future implementation will:
 * 1. Parse the hostname subdomain (e.g., mycafe.nextbooq.com → tenant = "mycafe")
 * 2. Route to the [tenant] segment for multi-tenant pages
 * 3. Protect dashboard routes with session-based auth
 *
 * For now, pass-through all requests.
 */
export function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
