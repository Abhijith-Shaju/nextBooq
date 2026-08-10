import { notFound } from 'next/navigation';
import { TenantProvider } from '@/components/providers/tenant-provider';
import { resolveTenantCafe } from '@/lib/resolve-tenant-cafe';

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;

  // Ignore static assets matched by dynamic tenant route
  const RESERVED_SLUGS = ['favicon.ico', 'sw.js', 'robots.txt', 'site.webmanifest', '_next'];
  if (RESERVED_SLUGS.includes(tenant.toLowerCase())) {
    notFound();
  }

  const result = await resolveTenantCafe({
    tenant,
    apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000',
    nodeEnv: process.env.NODE_ENV,
  });

  if ('notFound' in result) {
    notFound();
  }

  const { cafe } = result;

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

