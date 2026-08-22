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
