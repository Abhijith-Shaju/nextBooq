import { Cafe } from '@/lib/types/models';

export type ResolveTenantCafeResult = { cafe: Cafe } | { notFound: true };

const buildMockCafe = (tenant: string): Cafe => ({
  id: '65f000000000000000000123',
  slug: tenant,
  name: `${tenant.charAt(0).toUpperCase() + tenant.slice(1)} Cafe`,
  description: 'A beautifully crafted mock cafe for local frontend development.',
  timezone: 'Asia/Kolkata',
  // Must be CSS colours, not bare HSL triplets: TenantProvider injects these
  // straight into --brand-primary/--brand-accent, which Tailwind consumes as
  // `var(--brand-primary)` rather than `hsl(var(--brand-primary))`.
  brand_primary: '#1F6FEB',
  brand_accent: '#F97316',
  payments: {
    configured: true,
    razorpay_key_id: 'rzp_test_mockkey',
  },
  reservation_rules: {
    default_turn_time_minutes: 90,
    max_party_size: 12,
    booking_lead_time_hours: 24,
    hold_duration_minutes: 10,
    reservation_fee: 100,
  },
  menu: [
    {
      category: 'Signature Brews',
      items: [
        { name: 'Cold Brew Reserve', description: 'Steeped for 18 hours with single-origin beans', price: 220 },
        { name: 'Cardamom Cinnamon Latte', description: 'Velvety espresso with house-spiced oat milk', price: 260 },
      ],
    },
    {
      category: 'Artisanal Bakery',
      items: [
        { name: 'Almond Croissant', description: 'Flaky twice-baked butter croissant with frangipane', price: 190 },
      ],
    },
  ],
  contact_phone: '+91 98765 43210',
  address: {
    line1: '42 Indiranagar 100ft Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    postal_code: '560038',
  },
});

/**
 * Looks up a cafe by tenant slug. Distinguishes "backend is entirely
 * unreachable" (a common local-dev situation before you've started the
 * backend — falls back to a mock cafe in development only) from "the backend
 * responded but the cafe genuinely doesn't exist / the response was
 * malformed" (a real condition that must always be surfaced as notFound,
 * even in development — silently faking success here would hide real bugs
 * in cafe seeding/lookup while you're debugging them locally).
 */
export async function resolveTenantCafe({
  tenant,
  apiUrl,
  nodeEnv,
  fetchImpl = fetch,
}: {
  tenant: string;
  apiUrl: string;
  nodeEnv: string | undefined;
  fetchImpl?: typeof fetch;
}): Promise<ResolveTenantCafeResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${apiUrl}/api/v1/cafes/slug/${tenant}`, { cache: 'no-store' });
  } catch (networkError) {
    if (nodeEnv === 'development') {
      console.warn(
        `[TENANT LAYOUT] Backend unreachable at ${apiUrl} — using a MOCK cafe for "${tenant}" so local frontend development can continue. This is not real data.`
      );
      return { cafe: buildMockCafe(tenant) };
    }
    console.error('[TENANT LAYOUT] Failed to reach backend for tenant lookup:', networkError);
    return { notFound: true };
  }

  let data: any;
  try {
    data = await response.json();
  } catch (parseError) {
    console.error('[TENANT LAYOUT] Backend returned a non-JSON response for tenant lookup:', parseError);
    return { notFound: true };
  }

  if ((data.status === 'success' || data.success) && data.data) {
    return { cafe: { ...data.data, id: data.data._id || data.data.id } };
  }

  return { notFound: true };
}
