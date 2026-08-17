'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, Coffee, LogOut, LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/providers/auth-provider'
import { resolvePostAuthDestination } from '@/lib/auth/post-auth-destination'

const navLinks = [
  { label: 'Features', href: '#features' },
]

export default function MarketingHeader() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, isAuthenticated, logout } = useAuth()

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const dashboardHref = user
    ? resolvePostAuthDestination(user, null, typeof window !== 'undefined' ? window.location.host : null)
    : null
  const hasDashboardLink = dashboardHref !== null && dashboardHref !== '/'
  const dashboardLabel = user?.is_platform_admin ? 'Admin' : 'Dashboard'

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        isScrolled
          ? 'bg-brand-cream/90 backdrop-blur-md shadow-sm border-b border-brand-tan'
          : 'bg-transparent'
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">

          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 group"
            aria-label="nextBooq home"
          >
            <div className="w-8 h-8 bg-brand-red rounded-lg flex items-center justify-center shadow-brand-sm group-hover:shadow-brand-md transition-shadow">
              <Coffee className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-bold text-xl text-brand-brown tracking-tight">
              next<span className="text-brand-red">Booq</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8" aria-label="Main navigation">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-brand-mocha hover:text-brand-brown font-medium text-sm transition-colors relative group"
              >
                {link.label}
                <span className="absolute -bottom-0.5 left-0 w-0 h-0.5 bg-brand-red rounded-full transition-all duration-200 group-hover:w-full" />
              </Link>
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <>
                {hasDashboardLink && (
                  <Button variant="brand" size="default" asChild>
                    <Link href={dashboardHref} className="flex items-center gap-1.5">
                      <LayoutDashboard className="w-4 h-4" />
                      {dashboardLabel}
                    </Link>
                  </Button>
                )}
                <button
                  onClick={() => logout()}
                  className="p-2 rounded-xl text-brand-mocha hover:text-brand-red hover:bg-brand-tan/50 transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="text-brand-mocha hover:text-brand-brown font-medium text-sm transition-colors"
                >
                  Log in
                </Link>
                <Button variant="brand" size="default" asChild>
                  <Link href="/auth/register">Get Started</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-2 rounded-lg text-brand-brown hover:bg-brand-tan transition-colors"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile slide-down menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="md:hidden overflow-hidden bg-brand-cream/95 backdrop-blur-md border-b border-brand-tan"
          >
            <nav className="flex flex-col px-4 py-4 gap-4" aria-label="Mobile navigation">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-brand-mocha hover:text-brand-brown font-medium text-base py-1 transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex flex-col gap-3 pt-2 border-t border-brand-tan">
                {isAuthenticated ? (
                  <>
                    {hasDashboardLink && (
                      <Button variant="brand" size="lg" asChild className="w-full">
                        <Link href={dashboardHref} onClick={() => setMobileOpen(false)}>
                          Go to {dashboardLabel}
                        </Link>
                      </Button>
                    )}
                    <button
                      onClick={() => {
                        setMobileOpen(false)
                        logout()
                      }}
                      className="text-brand-mocha font-medium text-base py-1 text-left flex items-center gap-2"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/auth/login"
                      className="text-brand-mocha font-medium text-base py-1"
                      onClick={() => setMobileOpen(false)}
                    >
                      Log in
                    </Link>
                    <Button variant="brand" size="lg" asChild className="w-full">
                      <Link href="/auth/register" onClick={() => setMobileOpen(false)}>
                        Get Started
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

