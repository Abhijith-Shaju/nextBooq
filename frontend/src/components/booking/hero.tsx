'use client';

import { useTenant } from '@/components/providers/tenant-provider';
import Image from 'next/image';

export function Hero() {
  const { cafe } = useTenant();

  return (
    <div className="relative w-full h-[50vh] min-h-[400px] bg-slate-900 flex items-center justify-center overflow-hidden">
      {cafe.hero_image_url ? (
        <Image
          src={cafe.hero_image_url}
          alt={cafe.name}
          fill
          className="object-cover opacity-60 mix-blend-overlay"
          priority
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-r from-brand-red to-brand-mocha opacity-80" />
      )}
      
      <div className="relative z-10 flex flex-col items-center justify-center text-white p-6 text-center">
        {cafe.logo_url && (
          <div className="w-24 h-24 mb-6 rounded-full overflow-hidden border-4 border-white shadow-lg bg-white">
            <Image src={cafe.logo_url} alt={`${cafe.name} logo`} width={96} height={96} className="object-cover" />
          </div>
        )}
        <h1 className="text-5xl font-extrabold tracking-tight mb-4 drop-shadow-md">
          {cafe.name}
        </h1>
        {cafe.description && (
          <p className="text-xl max-w-2xl font-light opacity-90 drop-shadow">
            {cafe.description}
          </p>
        )}
      </div>
    </div>
  );
}
