export type StatusTone = 'success' | 'pending' | 'critical' | 'neutral';

export interface StatusDescription {
  label: string;
  tone: StatusTone;
}

const KNOWN_STATUSES: Record<string, StatusDescription> = {
  HOLD: { label: 'Held', tone: 'pending' },
  PENDING_PAYMENT: { label: 'Awaiting payment', tone: 'pending' },
  CONFIRMED: { label: 'Confirmed', tone: 'success' },
  CHECKED_IN: { label: 'Checked in', tone: 'success' },
  SEATED: { label: 'Seated', tone: 'success' },
  COMPLETED: { label: 'Completed', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'critical' },
  EXPIRED: { label: 'Expired', tone: 'critical' },
  NO_SHOW: { label: 'No-show', tone: 'critical' },
  LEFT_BEFORE_SEATING: { label: 'Left before seating', tone: 'critical' },
};

function titleCaseFallback(status: string): string {
  const words = status.toLowerCase().split('_');
  return words.map((word, i) => (i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word)).join(' ');
}

export function describeReservationStatus(status: string): StatusDescription {
  return KNOWN_STATUSES[status] ?? { label: titleCaseFallback(status), tone: 'neutral' };
}
