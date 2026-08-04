export type PlatformRole = 'SUPER_ADMIN' | 'SUPPORT' | null;

export type StaffRole = 'OWNER' | 'MANAGER' | 'HOST';

export interface StaffMembership {
  cafeId: string;
  role: StaffRole;
  permissions: string[];
}

export interface User {
  _id: string;
  name: string;
  email: string;
  phone: string;
  platform_role?: PlatformRole;
  staff_memberships?: StaffMembership[];
  createdAt?: string;
}

export interface Organization {
  _id: string;
  name: string;
  stripe_customer_id?: string;
  created_at: string;
}

export interface ReservationRules {
  default_turn_time_minutes: number;
  max_party_size: number;
  booking_lead_time_hours: number;
}

export interface CafeBranding {
  primary_color?: string;
  secondary_color?: string;
  logo_url?: string;
}

export type SubscriptionStatus = 'active' | 'inactive' | 'trial' | 'past_due' | 'expired';
export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

export interface Cafe {
  _id: string;
  org_id: string;
  name: string;
  slug: string;
  timezone: string;
  reservation_rules: ReservationRules;
  subscription_status: SubscriptionStatus;
  account_status?: AccountStatus;
  branding?: CafeBranding;
  is_deleted?: boolean;
  mrr?: number;
  reservation_count?: number;
}

export type TableStatus = 'active' | 'out_of_service';

export interface Table {
  _id: string;
  cafe_id: string;
  table_number: string;
  capacity: number;
  can_merge_with?: string[];
  status: TableStatus;
  is_deleted?: boolean;
  __v: number;
  x_coord?: number;
  y_coord?: number;
}

export type ReservationStatus =
  | 'HOLD'
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'SEATED'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'LEFT_BEFORE_SEATING';

export interface PaymentData {
  order_id?: string;
  payment_id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  webhook_processed?: boolean;
  requires_manual_refund?: boolean;
}

export interface StatusHistoryItem {
  status: ReservationStatus;
  timestamp: string;
  updated_by?: string;
}

export interface Reservation {
  _id: string;
  cafe_id: string;
  user_id: string;
  table_ids: string[];
  start_time: string;
  end_time: string;
  party_size: number;
  reservation_timezone: string;
  hold_expires_at?: string;
  status: ReservationStatus;
  __v: number;
  confirmed_at?: string;
  checked_in_at?: string;
  seated_at?: string;
  completed_at?: string;
  cancelled_at?: string;
  status_history?: StatusHistoryItem[];
  payment_data?: PaymentData;
  customer_name?: string;
  customer_phone?: string;
  created_at: string;
  updated_at: string;
}

export interface AvailableSlot {
  start_time: string;
  end_time: string;
  table_ids?: string[];
}

export interface PlatformSettings {
  is_marketplace_enabled: boolean;
}
