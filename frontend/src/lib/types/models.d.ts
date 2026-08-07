export interface ReservationRules {
  default_turn_time_minutes: number;
  max_party_size: number;
  booking_lead_time_hours: number;
  hold_duration_minutes: number;
}

export interface Cafe {
  id: string;
  _id?: string;
  org_id?: string;
  slug: string;
  name: string;
  description?: string;
  brand_primary?: string;
  brand_accent?: string;
  logo_url?: string;
  hero_image_url?: string;
  timezone: string;
  reservation_rules: ReservationRules;
}

export type ReservationStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'SEATED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface Reservation {
  id: string;
  _id?: string;
  cafe_id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  start_time: string; // ISO 8601 UTC string
  end_time: string; // ISO 8601 UTC string
  party_size: number;
  table_number?: string;
  status: ReservationStatus;
  __v: number; // OCC Version Token
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  hold_expires_at?: string;
  created_at?: string;
  updated_at?: string;
}

export type TableStatus = 'active' | 'out_of_service';

export interface Table {
  id: string;
  _id?: string;
  cafe_id: string;
  table_number: string;
  capacity: number;
  can_merge_with?: string[];
  status: TableStatus;
  is_deleted?: boolean;
}

export interface AvailableSlot {
  time: string; // HH:mm
  available: boolean;
  reason?: string;
}

export interface StaffMembership {
  cafe_id: string | Cafe;
  role: 'owner' | 'manager' | 'host';
  permissions: string[];
}

export interface User {
  id: string;
  _id?: string;
  email: string;
  name: string;
  phone?: string;
  staff_memberships: StaffMembership[];
  created_at?: string;
}

