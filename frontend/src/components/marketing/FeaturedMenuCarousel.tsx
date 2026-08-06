'use client'

import React, { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useReducedMotion, LayoutGroup } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import MenuItemCard from './MenuItemCard'
import type { MenuItem } from './menuItems'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeaturedMenuCarouselProps {
  items: MenuItem[]
}

// ─── Spring preset ────────────────────────────────────────────────────────────
const SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 }
const INSTANT = { duration: 0 }

// ─── Component ────────────────────────────────────────────────────────────────

export default function FeaturedMenuCarousel({ items }: FeaturedMenuCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(1) // Default to second card (Handcrafted Latte)
  const prefersReducedMotion = useReducedMotion() ?? false
  const carouselRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // ── Navigation ─────────────────────────────────────────────────────────────
  const prev = useCallback(() => {
    setActiveIndex((i) => (i - 1 + items.length) % items.length)
  }, [items.length])

  const next = useCallback(() => {
    setActiveIndex((i) => (i + 1) % items.length)
  }, [items.length])

  // ── Keyboard navigation ────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          prev()
          break
        case 'ArrowRight':
          e.preventDefault()
          next()
          break
        case 'Enter':
          // Enter on the carousel wrapper navigates to the registration/CTA page
          e.preventDefault()
          router.push('/auth/register')
          break
        default:
          break
      }
    },
    [prev, next]
  )

  // ── Touch/swipe support ────────────────────────────────────────────────────
  const touchStartX = useRef<number>(0)
  const touchEndX = useRef<number>(0)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].clientX
    const diff = touchStartX.current - touchEndX.current
    if (Math.abs(diff) > 50) {
      if (diff > 0) next()
      else prev()
    }
  }

  const transition = prefersReducedMotion ? INSTANT : SPRING

  return (
    <section
      id="menu"
      className="relative py-24 lg:py-32 overflow-hidden bg-gradient-to-b from-brand-cream to-brand-tan/40"
      aria-label="Featured Menu Carousel"
    >
      {/* ── Background decorative blobs ──────────────────────────────────── */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-blush/30 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-brand-tan/60 rounded-full blur-[80px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* ── Section header ─────────────────────────────────────────────── */}
        <div className="text-center mb-16 space-y-4">
          <div className="inline-flex items-center gap-2 bg-brand-blush/40 border border-brand-blush
                          text-brand-red text-sm font-semibold px-4 py-1.5 rounded-full">
            ☕ Our Featured Menu
          </div>
          <h2 className="font-display text-4xl sm:text-5xl font-bold text-brand-brown">
            Treat Yourself,{' '}
            <span className="text-brand-red italic">Today.</span>
          </h2>
          <p className="font-sans text-brand-mocha text-lg max-w-xl mx-auto">
            Handcrafted beverages made with premium ingredients. Every sip is an experience.
          </p>
        </div>

        {/* ── Desktop Carousel (≥640px): 4-card center-focus layout ────── */}
        <div className="hidden sm:block">
          <div
            ref={carouselRef}
            role="region"
            aria-roledescription="carousel"
            aria-label="Featured menu items"
            aria-live="polite"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            className="relative focus:outline-none focus-visible:ring-2
                       focus-visible:ring-brand-red focus-visible:ring-offset-2 rounded-3xl"
          >
            <LayoutGroup>
              <div className="flex items-center justify-center gap-4 lg:gap-6 py-12 px-4">
                {items.map((item, index) => {
                  const isActive = index === activeIndex

                  return (
                    <motion.div
                      key={item.id}
                      layout
                      transition={transition}
                      animate={{
                        scale: isActive ? 1.05 : 0.88,
                        zIndex: isActive ? 20 : 10,
                        opacity: isActive ? 1 : 0.82,
                      }}
                      className={cn(
                        'flex-1 min-w-0',
                        isActive
                          ? 'max-w-[280px] lg:max-w-[320px]'
                          : 'max-w-[200px] lg:max-w-[240px]'
                      )}
                    >
                      <MenuItemCard
                        item={item}
                        isActive={isActive}
                        onClick={() => setActiveIndex(index)}
                        reducedMotion={prefersReducedMotion}
                      />
                    </motion.div>
                  )
                })}
              </div>
            </LayoutGroup>

            {/* Navigation arrows */}
            <div className="flex items-center justify-center gap-4 mt-8">
              <button
                onClick={prev}
                aria-label="Previous item"
                className="w-12 h-12 rounded-full glass shadow-card-glass flex items-center justify-center
                           text-brand-brown hover:bg-brand-red hover:text-white hover:border-brand-red
                           transition-all duration-200 hover:shadow-brand-md"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              {/* Dot indicators */}
              <div className="flex items-center gap-2" role="tablist" aria-label="Carousel position">
                {items.map((item, index) => (
                  <button
                    key={item.id}
                    role="tab"
                    aria-selected={index === activeIndex}
                    aria-label={`Go to ${item.name}`}
                    onClick={() => setActiveIndex(index)}
                    className={cn(
                      'rounded-full transition-all duration-300',
                      index === activeIndex
                        ? 'w-8 h-2.5 bg-brand-red'
                        : 'w-2.5 h-2.5 bg-brand-mocha/30 hover:bg-brand-mocha/60'
                    )}
                  />
                ))}
              </div>

              <button
                onClick={next}
                aria-label="Next item"
                className="w-12 h-12 rounded-full glass shadow-card-glass flex items-center justify-center
                           text-brand-brown hover:bg-brand-red hover:text-white hover:border-brand-red
                           transition-all duration-200 hover:shadow-brand-md"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Mobile Carousel (<640px): single card view with swipe nav ─── */}
        {/* No horizontal overflow — single card, full width, arrow nav */}
        <div
          className="sm:hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="pt-20 pb-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={`mobile-card-${activeIndex}`}
                initial={prefersReducedMotion ? undefined : { opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, x: -40 }}
                transition={prefersReducedMotion ? INSTANT : { duration: 0.25, ease: 'easeInOut' }}
                className="max-w-xs mx-auto"
              >
                <MenuItemCard
                  item={items[activeIndex]}
                  isActive
                  onClick={() => {}}
                  reducedMotion={prefersReducedMotion}
                />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Mobile arrow nav */}
          <div className="flex items-center justify-between max-w-xs mx-auto mt-4">
            <button
              onClick={prev}
              aria-label="Previous item"
              className="w-12 h-12 rounded-full glass flex items-center justify-center
                         text-brand-brown hover:bg-brand-red hover:text-white transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Mobile dots */}
            <div className="flex items-center gap-2">
              {items.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => setActiveIndex(index)}
                  aria-label={`Go to ${item.name}`}
                  aria-current={index === activeIndex ? 'true' : undefined}
                  className={cn(
                    'rounded-full transition-all duration-300',
                    index === activeIndex
                      ? 'w-8 h-2.5 bg-brand-red'
                      : 'w-2.5 h-2.5 bg-brand-mocha/30'
                  )}
                />
              ))}
            </div>

            <button
              onClick={next}
              aria-label="Next item"
              className="w-12 h-12 rounded-full glass flex items-center justify-center
                         text-brand-brown hover:bg-brand-red hover:text-white transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Mobile item name indicator */}
          <p className="text-center text-brand-mocha font-sans text-sm mt-4 font-medium">
            {activeIndex + 1} / {items.length} — {items[activeIndex].name}
          </p>
        </div>

      </div>
    </section>
  )
}
