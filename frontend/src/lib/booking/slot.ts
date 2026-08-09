import { AvailableSlot } from '@/lib/types/models';

export interface SlotDescription {
  label: string;
  sublabel: string;
  selectable: boolean;
}

export function describeSlot(slot: AvailableSlot, holdDurationMinutes: number): SlotDescription {
  return {
    label: slot.time,
    sublabel: slot.available ? `${Math.round(holdDurationMinutes)} min hold` : 'Sold out',
    selectable: slot.available,
  };
}
