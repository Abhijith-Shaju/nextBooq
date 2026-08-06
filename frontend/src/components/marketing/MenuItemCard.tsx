'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion, AnimatePresence, type Transition } from 'framer-motion'
import { Flame, Snowflake, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MenuItem } from './menuItems'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MenuItemCardProps {
  item: MenuItem
  isActive: boolean
  onClick: () => void
  reducedMotion: boolean
}

const SPRING: Transition = { type: 'spring', stiffness: 300, damping: 30 }
const INSTANT: Transition = { duration: 0 }

// ─── Size selector ────────────────────────────────────────────────────────────
const SIZES = ['S', 'M', 'L'] as const
type Size = (typeof SIZES)[number]

// ─── Component ────────────────────────────────────────────────────────────────

export default function MenuItemCard({
  item,
  isActive,
  onClick,
  reducedMotion,
}: MenuItemCardProps) {
  const [selectedSize, setSelectedSize] = useState<Size>('M')
  const [selectedFlavour, setSelectedFlavour] = useState(item.flavours[0])
  const [drinkType, setDrinkType] = useState<'Hot' | 'Iced'>('Hot')

  const transition = reducedMotion ? INSTANT : SPRING

  return (
    <motion.div
      layout
      layoutId={`card-${item.id}`}
      onClick={!isActive ? onClick : undefined}
      onKeyDown={(e) => {
        if (!isActive && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
      tabIndex={isActive ? -1 : 0}
      role={isActive ? 'article' : 'button'}
      aria-label={isActive ? `${item.name} — currently featured` : `Select ${item.name}`}
      aria-current={isActive ? 'true' : undefined}
      transition={transition}
      className={cn(
        'relative flex flex-col rounded-3xl overflow-visible cursor-pointer select-none outline-none pt-8',
        'focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2',
        isActive
          ? 'bg-brand-red z-20 shadow-brand-xl cursor-default'
          : 'glass z-10 hover:shadow-md transition-shadow'
      )}
    >
      {/* ── Active card gradient overlay (darker red at bottom) ──────────── */}
      {isActive && (
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none"
          style={{
            background:
              'linear-gradient(160deg, transparent 40%, rgba(155, 13, 33, 0.55) 100%)',
          }}
        />
      )}

      {/* ── Glass shine on active card ────────────────────────────────────── */}
      {isActive && (
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none"
          style={{
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 50%)',
          }}
        />
      )}

      {/* ── Product image — overflows top edge ───────────────────────────── */}
      <motion.div
        layout
        transition={transition}
        className={cn(
          'relative mx-auto flex-shrink-0 -translate-y-8',
          isActive
            ? 'w-36 h-36 sm:w-44 sm:h-44'
            : 'w-24 h-24 sm:w-32 sm:h-32'
        )}
      >
        {/*
          PLACEHOLDER: imageUrl is an Unsplash URL. Replace with a transparent-bg PNG
          of the actual product for best results. See menuItems.ts for details.
        */}
        <Image
          src={item.imageUrl}
          alt={item.name}
          fill
          sizes={isActive ? '(max-width: 640px) 176px, 208px' : '(max-width: 640px) 112px, 144px'}
          className="object-cover rounded-full product-shadow"
          priority={isActive}
        />

        {/* Badge */}
        {item.badge && isActive && (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: -8, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reducedMotion ? INSTANT : { ...SPRING, delay: 0.1 }}
            className="absolute -top-2 -right-2 bg-white text-brand-red text-xs font-bold
                       px-2.5 py-1 rounded-full shadow-brand-sm"
          >
            {item.badge}
          </motion.div>
        )}
      </motion.div>

      {/* ── Card body ────────────────────────────────────────────────────── */}
      <div className={cn('flex flex-col flex-1 px-5 pb-5', isActive ? 'pt-4' : 'pt-3')}>

        {/* Name */}
        <motion.h3
          layout
          transition={transition}
          className={cn(
            'font-display font-bold leading-tight',
            isActive
              ? 'text-white text-xl sm:text-2xl'
              : 'text-brand-brown text-sm sm:text-base text-center'
          )}
        >
          {item.name}
        </motion.h3>

        {/* Nutrition line — always visible */}
        <motion.p
          layout
          transition={transition}
          className={cn(
            'font-sans text-xs mt-1',
            isActive ? 'text-white/70' : 'text-brand-mochaMid text-center'
          )}
        >
          {item.nutritionLabel}
        </motion.p>

        {/* ── Active-only expanded content ──────────────────────────────── */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              key="active-content"
              initial={reducedMotion ? undefined : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: 8 }}
              transition={reducedMotion ? INSTANT : { duration: 0.2, ease: 'easeOut' }}
              className="flex flex-col gap-4 mt-5"
            >
              {/* Price */}
              <p className="text-white font-display font-bold text-2xl">
                ₹{item.price}
              </p>

              {/* Divider */}
              <div className="border-t border-white/20" />

              {/* Size selector */}
              <div className="flex items-center justify-between">
                <span className="text-white/70 text-sm font-sans">Size</span>
                <div
                  className="flex items-center gap-1 bg-white/10 rounded-full p-1"
                  role="group"
                  aria-label="Select drink size"
                >
                  {SIZES.map((size) => (
                    <button
                      key={size}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedSize(size)
                      }}
                      aria-label={`Size ${size}`}
                      aria-pressed={selectedSize === size}
                      className={cn(
                        'size-pill',
                        selectedSize === size ? 'size-pill-active' : 'size-pill-inactive'
                      )}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Flavour selector */}
              <div className="flex items-center justify-between">
                <span className="text-white/70 text-sm font-sans">Flavour</span>
                <div className="relative">
                  <select
                    value={selectedFlavour}
                    onChange={(e) => {
                      e.stopPropagation()
                      setSelectedFlavour(e.target.value)
                    }}
                    aria-label="Select flavour"
                    className="appearance-none bg-white/10 text-white text-sm font-sans
                               rounded-full px-3 py-1.5 pr-8 border border-white/20
                               focus:outline-none focus:ring-1 focus:ring-white/40
                               cursor-pointer max-w-[160px] truncate"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {item.flavours.map((f) => (
                      <option key={f} value={f} className="text-brand-brown bg-white">
                        {f}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/60 pointer-events-none" />
                </div>
              </div>

              {/* Hot / Iced toggle */}
              <div className="flex items-center justify-between">
                <span className="text-white/70 text-sm font-sans">Type</span>
                <div
                  className="flex items-center gap-1 bg-white/10 rounded-full p-1"
                  role="group"
                  aria-label="Select drink temperature"
                >
                  {(['Hot', 'Iced'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={(e) => {
                        e.stopPropagation()
                        setDrinkType(type)
                      }}
                      aria-label={type}
                      aria-pressed={drinkType === type}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-sans transition-colors',
                        drinkType === type
                          ? 'bg-white text-brand-red'
                          : 'text-white/70 hover:text-white'
                      )}
                    >
                      {type === 'Hot' ? (
                        <Flame className="w-3.5 h-3.5" />
                      ) : (
                        <Snowflake className="w-3.5 h-3.5" />
                      )}
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Get Started CTA — routes to /auth/register (marketing CTA, not real cart) */}
              <Button
                variant="ghost"
                size="lg"
                asChild
                className="w-full bg-white text-brand-red hover:bg-white/90 hover:text-brand-redDark
                           rounded-full font-semibold mt-2 shadow-brand-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <Link href="/auth/register">
                  Get Started
                </Link>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
