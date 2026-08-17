'use client';

import { useState } from 'react';
import { useTenant } from '@/components/providers/tenant-provider';
import Image from 'next/image';
import { Coffee, Clock, ShieldCheck, Sparkles, MapPin, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

export function Hero() {
  const { cafe } = useTenant();
  // A cafe owner can save a URL that isn't actually a direct image link (the
  // most common case: pasting a Google Images "view image" result, which
  // points at a results-page wrapper rather than the CDN image itself) —
  // this falls back to the same gradient shown when no photo is set at all,
  // rather than leaving a broken/blank image in the hero banner.
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const showHeroImage = !!cafe.hero_image_url && !heroImageFailed;

  return (
    <div className="relative w-full min-h-[440px] lg:min-h-[500px] bg-brand-brown text-white flex items-center justify-center overflow-hidden py-16 px-4">
      {/* Background Hero Image / Ambient Glow */}
      {showHeroImage ? (
        <Image
          src={cafe.hero_image_url!}
          alt={cafe.name}
          fill
          className="object-cover opacity-40 mix-blend-overlay"
          priority
          onError={() => setHeroImageFailed(true)}
        />
      ) : (
        <div
          data-testid="hero-gradient-fallback"
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-red/40 via-brand-brown to-brand-brown opacity-90"
        />
      )}

      {/* Decorative Blobs */}
      <div className="absolute top-1/4 left-10 w-72 h-72 bg-brand-red/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-brand-accent/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto text-center space-y-6">
        {/* Status Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 px-4 py-1.5 rounded-full text-xs font-bold text-brand-cream shadow-sm"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Accepting Real-Time Table Holds
        </motion.div>

        {/* Cafe Title & Description */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-3"
        >
          <h1 className="text-4xl sm:text-6xl font-black font-display tracking-tight text-white drop-shadow-md">
            {cafe.name}
          </h1>
          <p className="text-base sm:text-lg max-w-2xl mx-auto font-sans font-light text-brand-cream/90 leading-relaxed drop-shadow">
            {cafe.description || 'Experience handcrafted dining and effortless table reservations with instant confirmation.'}
          </p>
        </motion.div>

        {/* Key Features Badges */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-brand-tan pt-2"
        >
          <div className="flex items-center gap-1.5 bg-white/10 px-3.5 py-1.5 rounded-xl border border-white/10">
            <Clock className="w-4 h-4 text-brand-red" />
            <span>{cafe.reservation_rules?.default_turn_time_minutes || 90} Min Turn Time</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white/10 px-3.5 py-1.5 rounded-xl border border-white/10">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Instant Lock Guarantee</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white/10 px-3.5 py-1.5 rounded-xl border border-white/10">
            <MapPin className="w-4 h-4 text-amber-400" />
            <span>Timezone: {cafe.timezone || 'Asia/Kolkata'}</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
