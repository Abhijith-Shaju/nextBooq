'use client';

import { useBookingStore } from '@/store/use-booking-store';
import { Label } from '@/components/ui/label';
import { Users, User, UserPlus } from 'lucide-react';
import { motion } from 'framer-motion';

export function PartySizeSelect() {
  const { partySize, setPartySize } = useBookingStore();

  const presetSizes = [1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="party-size" className="text-sm font-bold text-brand-brown flex items-center gap-2">
          <Users className="w-4 h-4 text-brand-red" />
          Party Size
        </Label>
        <span className="text-xs font-semibold text-brand-mocha">
          {partySize} {partySize === 1 ? 'Guest' : 'Guests'} Selected
        </span>
      </div>

      {/* Guest Count Pill Selector */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {presetSizes.map((size) => {
          const isSelected = partySize === size;
          return (
            <motion.button
              key={size}
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setPartySize(size)}
              className={`h-11 rounded-2xl font-bold text-sm flex flex-col items-center justify-center transition-all duration-200 border ${
                isSelected
                  ? 'bg-brand-red text-white border-brand-red shadow-brand-sm'
                  : 'bg-white/80 text-brand-brown border-brand-brown/15 hover:bg-brand-tan/40 hover:border-brand-brown/30'
              }`}
            >
              <span>{size}</span>
            </motion.button>
          );
        })}
      </div>

      {/* Large Group Note */}
      {partySize >= 7 && (
        <motion.p
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[11px] text-brand-mocha flex items-center gap-1.5 pt-1 font-medium"
        >
          <UserPlus className="w-3.5 h-3.5 text-brand-red" />
          Large party? Tables will be automatically merged for your group capacity.
        </motion.p>
      )}
    </div>
  );
}
