import { notFound } from 'next/navigation';
import { TenantProvider } from '@/components/providers/tenant-provider';
import { Cafe } from '@/lib/types/models';

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;

  // Try to get cafe details from our backend
  let cafe: Cafe | null = null;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/v1/cafes/slug/${tenant}`, {
      next: { revalidate: 300 }, // 5 minutes
    });
    const data = await res.json();
    if (data.success && data.data) {
      cafe = data.data;
    }
  } catch (error) {
    console.error('Error fetching tenant details', error);
  }

  if (!cafe) {
    // For local development when backend is down, use a mock cafe
    if (process.env.NODE_ENV === 'development') {
      cafe = {
        id: 'mock-id-123',
        slug: tenant,
        name: `${tenant.charAt(0).toUpperCase() + tenant.slice(1)} Cafe`,
        description: 'A beautifully crafted mock cafe for local frontend development.',
        timezone: 'Asia/Kolkata',
        brand_primary: '220 89% 53%',
        brand_accent: '24 98% 50%',
        reservation_rules: {
          default_turn_time_minutes: 90,
          max_party_size: 12,
          booking_lead_time_hours: 24,
          hold_duration_minutes: 10,
        },
      };
    } else {
      notFound();
    }
  }

  return (
    <TenantProvider cafe={cafe}>
      <div
        className="min-h-screen bg-background"
        style={{
          '--brand-primary': cafe.brand_primary || '220 89% 53%',
          '--brand-accent': cafe.brand_accent || '24 98% 50%',
        } as React.CSSProperties}
      >
        {children}
      </div>
    </TenantProvider>
  );
}

