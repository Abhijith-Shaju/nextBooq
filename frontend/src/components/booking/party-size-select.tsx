'use client';

import { useBookingStore } from '@/store/use-booking-store';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Users } from 'lucide-react';

export function PartySizeSelect() {
  const { partySize, setPartySize } = useBookingStore();

  return (
    <div className="space-y-3">
      <Label htmlFor="party-size" className="text-sm font-semibold flex items-center gap-2">
        <Users className="w-4 h-4 text-brandPrimary" />
        Party Size
      </Label>
      <Select value={partySize.toString()} onValueChange={(v) => setPartySize(parseInt(v, 10))}>
        <SelectTrigger id="party-size" className="w-full h-12 text-lg rounded-xl">
          <SelectValue placeholder="Select party size" />
        </SelectTrigger>
        <SelectContent>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((size) => (
            <SelectItem key={size} value={size.toString()}>
              {size} {size === 1 ? 'Person' : 'People'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
