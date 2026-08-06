export interface Cafe {
  id: string;
  slug: string;
  name: string;
  description?: string;
  brandPrimaryColor?: string;
  brandAccentColor?: string;
  logoUrl?: string;
  heroImageUrl?: string;
  timezone: string;
}

export interface ReservationRules {
  maxPartySize: number;
  minLeadTimeHours: number;
  maxLeadTimeDays: number;
  slotDurationMinutes: number;
}

export interface AvailableSlot {
  time: string; // HH:mm
  available: boolean;
  reason?: string;
}

export interface Reservation {
  id: string;
  cafeId: string;
  userId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  partySize: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  paymentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  createdAt: string;
}
