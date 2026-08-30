import type { CafeAddress, SubscriptionStatus, SubscriptionTermMonths } from './models';

export interface OwnedOrganization {
  id: string;
  name: string;
}

export interface OwnerLookupResult {
  id: string;
  name: string;
  email: string;
  staff_memberships: Array<{
    role: string;
    cafe: { id: string; name: string; slug: string; organization: OwnedOrganization | null };
  }>;
  owned_organizations: OwnedOrganization[];
}

// Shared by direct admin provisioning (ProvisionCafePayload) and application
// approval (useApproveCafeApplication) — both hand the admin's chosen
// subscription terms to the same backend contract, so this is declared once
// rather than inlined twice.
export interface ProvisionSubscription {
  status: Extract<SubscriptionStatus, 'active' | 'trial'>;
  term_months: SubscriptionTermMonths;
  price_per_month: number;
  note?: string;
}

export interface ProvisionCafePayload {
  owner_user_id: string;
  organization: { mode: 'new'; name: string } | { mode: 'existing'; id: string };
  cafe: { name: string; slug: string; timezone: string; address: CafeAddress };
  subscription: ProvisionSubscription;
}

export interface ProvisionedCafe {
  id: string;
  name: string;
  slug: string;
  timezone: string;
}

export interface ProvisionCafeResult {
  owner: Pick<OwnerLookupResult, 'id' | 'name' | 'email'>;
  organization: OwnedOrganization;
  cafe: ProvisionedCafe;
  subscription: {
    id: string;
    status: Extract<SubscriptionStatus, 'active' | 'trial'>;
    term_months: SubscriptionTermMonths;
    price_per_month: number;
    period_start: string;
    current_period_end: string;
    is_current: boolean;
  };
}
