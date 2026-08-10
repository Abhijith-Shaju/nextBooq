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
  | 'HOLD'
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'SEATED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'NO_SHOW'
  | 'LEFT_BEFORE_SEATING';

// A reservation can span multiple tables (merged tables for a large party),
// so the backend never returns a single flat table_number on a reservation —
// only table_ids, populated with {_id, table_number, capacity} by the host
// manifest / customer reservations endpoints. See lib/dashboard/reservation-tables.ts
// for the helpers that derive display strings / matching from this.
export type ReservationTableRef = string | { _id?: string; id?: string; table_number: string; capacity?: number };

// Similarly, there is no flat guest_name/guest_email/guest_phone on a
// reservation — the backend stores the booking customer as user_id, and only
// populates it with {name, email, phone} on endpoints that need to display
// guest identity (currently the host daily manifest). See
// lib/dashboard/reservation-guest.ts for the helpers that read this safely.
export type ReservationUserRef = string | { _id?: string; id?: string; name: string; email: string; phone?: string };

export interface Reservation {
  id: string;
  _id?: string;
  cafe_id: string;
  user_id?: ReservationUserRef;
  start_time: string; // ISO 8601 UTC string
  end_time: string; // ISO 8601 UTC string
  party_size: number;
  table_ids?: ReservationTableRef[];
  status: ReservationStatus;
  __v: number; // OCC Version Token
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  hold_expires_at?: string;
  payment_data?: {
    order_id?: string;
    amount?: number;
    currency?: string;
    expires_at?: string;
  };
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

