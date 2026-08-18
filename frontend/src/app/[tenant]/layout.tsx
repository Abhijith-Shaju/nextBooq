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
      {/* TenantProvider itself sets --brand-primary/--brand-accent (as hex,
          via resolveTenantTheme) on its own wrapping div — duplicating that
          here in a different, CSS-invalid format (bare "H S% L%" triplet
          instead of hex or hsl(...)) shadowed the correct value for every
          page, making bg-brand-red-based buttons resolve to a transparent
          background with white text on top. */}
      <div className="min-h-screen bg-background">{children}</div>
    </TenantProvider>
  );
}

