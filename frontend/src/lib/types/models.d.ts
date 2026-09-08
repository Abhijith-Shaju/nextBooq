export interface ReservationRules {
  default_turn_time_minutes: number;
  max_party_size: number;
  booking_lead_time_hours: number;
  hold_duration_minutes: number;
  reservation_fee: number; // rupees, charged to the customer at checkout
  // Fee terms shown to the guest before payment. Optional because a cafe
  // provisioned before these settings existed has no stored value; treat a
  // missing value as the platform default (adjusted, refundable, 24h).
  fee_adjusted_against_bill?: boolean;
  refund_on_cancellation?: boolean;
  cancellation_cutoff_hours?: number;
  no_show_grace_minutes?: number;
  payment_timeout_minutes?: number;
}

/**
 * The fee terms as they stood when a reservation was made, snapshotted onto
 * the booking so a later change to the cafe's settings cannot rewrite the
 * deal a guest already paid under.
 */
export interface ReservationFeePolicy {
  adjusted_against_bill: boolean;
  refund_on_cancellation: boolean;
  cancellation_cutoff_hours: number;
  no_show_grace_minutes?: number;
}

export interface OperatingHourEntry {
  day_of_week: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  open_time: string; // HH:mm
  close_time: string; // HH:mm
  is_closed: boolean;
}

export interface CafeMenuItem {
  name: string;
  description?: string;
  price?: number;
}

export interface CafeMenuCategory {
  category: string;
  items: CafeMenuItem[];
}

export interface CafeAddress {
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  postal_code: string;
  country?: string;
  map_url?: string;
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
  hero_overlay?: 'subtle' | 'balanced' | 'vivid';
  contact_phone?: string;
  gstin?: string;
  address?: CafeAddress;
  menu?: CafeMenuCategory[];
  payments?: {
    razorpay_key_id: string;
    configured: boolean;
  };
  timezone: string;
  reservation_rules: ReservationRules;
  operating_hours?: OperatingHourEntry[];
}

export type SubscriptionTermMonths = 1 | 6 | 12 | 18;
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'inactive';

export interface Subscription {
  _id: string;
  org_id: string;
  cafe_id: string;
  term_months: SubscriptionTermMonths;
  price_per_month: number;
  period_start: string;
  current_period_end: string;
  status: SubscriptionStatus;
  is_current: boolean;
  note?: string;
  created_at: string;
}

// Deliberately NOT `extends Cafe`: the admin list/overview endpoints read
// with Mongoose's `.lean()` (plain objects, no virtuals), so the response
// only ever has `_id`, never the `id` virtual the main `Cafe` interface
// declares as required. Extending `Cafe` here would claim a field that
// never actually arrives over the wire.
export interface CafeWithSubscription {
  _id: string;
  org_id: string;
  name: string;
  slug: string;
  timezone: string;
  subscription_status: string;
  subscription: Subscription | null;
  owner: { name: string; email: string; phone: string } | null;
  created_at: string;
}

export interface OrgWithCafes {
  _id: string;
  name: string;
  cafes: CafeWithSubscription[];
}

export interface AdminOverviewStats {
  org_count: number;
  cafe_count: number;
  status_counts: Record<SubscriptionStatus, number>;
  pending_count: number;
  revenue: number;
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

// Populated with {name, slug, timezone, brand_primary, brand_accent} by
// GET /customer/reservations (see backend customerController) — the same
// populate-for-reads-but-send-cafe_id-for-writes contract as user_id/table_ids
// on this model.
export type ReservationCafeRef = string | { _id?: string; id?: string; name: string; slug: string };

export interface Reservation {
  id: string;
  _id?: string;
  cafe_id: ReservationCafeRef;
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
    payment_id?: string | null;
    amount?: number;
    currency?: string;
    expires_at?: string;
    // Refund bookkeeping. nextBooq never moves money out of a cafe's Razorpay
    // account, so these record what is owed and what has been paid back
    // rather than driving any transfer.
    requires_manual_refund?: boolean;
    refund_reason?: string | null;
    refund_reference?: string | null;
    refund_settled_at?: string | null;
  };
  // The fee terms as they stood when this booking was made, snapshotted by the
  // backend so a later change to the cafe's settings cannot rewrite the deal.
  // Present on the customer's own reservations, which the cancel dialog reads
  // to tell a guest the notice required before they decide.
  fee_policy?: ReservationFeePolicy;
  // This cafe's own history with the guest, attached by the host manifest
  // endpoint. Optional because only that endpoint sends it -- the customer's
  // own reservation list deliberately does not, since these counters are the
  // cafe's operational view rather than something to show the diner.
  guest_history?: {
    total_visits: number;
    total_no_shows: number;
  };
  created_at?: string;
  updated_at?: string;
}

export type TableStatus = 'active' | 'out_of_service';
export type TableZone = 'indoor' | 'window' | 'outdoor' | 'patio' | 'private';

// Populated with {_id, table_number} by GET /tables — the same
// populate-for-reads-but-send-table_number-for-writes contract as
// table_ids on Reservation. See lib/dashboard/table-merge.ts.
export type TableMergeRef = string | { _id?: string; id?: string; table_number: string };

export interface Table {
  id: string;
  _id?: string;
  cafe_id: string;
  table_number: string;
  capacity: number;
  can_merge_with?: TableMergeRef[];
  zone: TableZone;
  floor: number;
  status: TableStatus;
  is_deleted?: boolean;
}

export interface AvailableSlot {
  time: string; // HH:mm
  available: boolean;
  reason?: string;
}

export interface StaffMembershipCafe {
  id?: string;
  _id?: string;
  name: string;
  slug: string;
  timezone?: string;
  reservation_rules?: Partial<ReservationRules>;
}

export interface StaffMembership {
  cafe_id: string | StaffMembershipCafe;
  role: 'owner' | 'manager' | 'host' | 'staff';
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
  is_platform_admin: boolean;
  owner_org_id: string | null;
  is_email_verified: boolean;
  pending_email?: string | null;
  // UI hint only — never used for authorization. See lib/route-guard.ts and
  // lib/auth/post-auth-destination.ts for the actual access-control checks.
  account_type: 'customer' | 'cafe_owner' | null;
  cafe_application: import('./cafe-application').CafeApplicationSummary | null;
}

