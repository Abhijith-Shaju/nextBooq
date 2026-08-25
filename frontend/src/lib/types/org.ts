export interface Organization {
  id: string;
  name: string;
}

export interface OrgCafe {
  _id: string;
  name: string;
  slug: string;
  subscription_status: string;
  today_reservation_count: number;
}

export interface CafeStaffMember {
  user_id: string;
  name: string;
  email: string;
  role: 'owner' | 'manager' | 'host' | 'staff';
}
