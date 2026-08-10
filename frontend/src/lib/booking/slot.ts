import { AvailableSlot } from '@/lib/types/models';

export interface SlotDescription {
  label: string;
  sublabel: string;
  selectable: boolean;
}

function summarizeUnavailableReason(reason?: string): string {
  if (!reason) return 'Sold out';
  if (/closed/i.test(reason)) return 'Closed';
  if (/before cafe opening/i.test(reason)) return 'Before opening';
  if (/exceeds cafe closing/i.test(reason)) return 'After closing';
  if (/no available table/i.test(reason) || /accommodate a party/i.test(reason)) return 'Fully booked';
  return 'Sold out';
}

export function describeSlot(slot: AvailableSlot, holdDurationMinutes: number): SlotDescription {
  return {
    label: slot.time,
    sublabel: slot.available
      ? `${Math.round(holdDurationMinutes)} min hold`
      : summarizeUnavailableReason(slot.reason),
    selectable: slot.available,
  };
}
