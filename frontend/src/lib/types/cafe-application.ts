import type { CafeAddress } from './models';

export type CafeApplicationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface CafeApplicationSummary {
  id: string;
  application_ref: string;
  status: CafeApplicationStatus;
  cafe_slug: string;
  cafe_name: string;
  created_at: string;
  review_note: string;
}

export interface CafeApplicationPayload {
  organization_name: string;
  cafe_name: string;
  cafe_slug: string;
  timezone: string;
  address: CafeAddress;
}

// Task 13's admin review screen consumes this shape — the applicant-facing
// summary plus the fields only the reviewer/admin view needs. Backend's
// withApplicant query returns exactly these fields on top of the summary.
export interface CafeApplicationDetail extends CafeApplicationSummary {
  organization_name: string;
  timezone: string;
  address: CafeAddress;
  reviewed_at?: string | null;
  applicant: { id: string; name: string; email: string; phone: string } | null;
}
