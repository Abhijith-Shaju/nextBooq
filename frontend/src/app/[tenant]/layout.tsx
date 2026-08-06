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
        timezone: 'UTC',
        brandPrimaryColor: '220 89% 53%',
        brandAccentColor: '24 98% 50%',
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
          '--brand-primary': cafe.brandPrimaryColor || '220 89% 53%',
          '--brand-accent': cafe.brandAccentColor || '24 98% 50%',
        } as React.CSSProperties}
      >
        {children}
      </div>
    </TenantProvider>
  );
}
