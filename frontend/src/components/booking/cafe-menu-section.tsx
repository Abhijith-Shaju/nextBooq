'use client';

import { useTenant } from '@/components/providers/tenant-provider';
import { UtensilsCrossed } from 'lucide-react';

export function CafeMenuSection() {
  const { cafe } = useTenant();

  const categoriesWithItems = (cafe.menu || []).filter((cat) => cat.items.length > 0);
  if (categoriesWithItems.length === 0) {
    return null;
  }

  return (
    <section className="py-12 max-w-4xl mx-auto w-full px-4">
      <div className="text-center space-y-1 mb-8">
        <h3 className="font-display text-2xl font-bold text-brand-brown flex items-center justify-center gap-2">
          <UtensilsCrossed className="w-6 h-6 text-brand-red" /> Menu
        </h3>
      </div>

      <div className="space-y-4">
        {categoriesWithItems.map((cat, i) => (
          <details key={i} open className="glass rounded-2xl border border-brand-brown/10 shadow-brand-sm group">
            <summary className="cursor-pointer list-none px-5 py-4 font-display font-bold text-brand-brown flex items-center justify-between">
              {cat.category}
              <span className="text-xs text-brand-mochaMid group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="px-5 pb-4 space-y-3">
              {cat.items.map((item, j) => (
                <div key={j} className="flex items-start justify-between gap-4 border-t border-brand-brown/10 pt-3 first:border-t-0 first:pt-0">
                  <div>
                    <p className="text-sm font-semibold text-brand-brown">{item.name}</p>
                    {item.description && <p className="text-xs text-brand-mocha mt-0.5">{item.description}</p>}
                  </div>
                  {item.price !== undefined && item.price !== null && (
                    <span className="text-sm font-mono font-bold text-brand-brown whitespace-nowrap">₹{item.price}</span>
                  )}
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
