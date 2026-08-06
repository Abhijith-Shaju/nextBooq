/**
 * [tenant] root layout.
 * All tenant-specific pages (both dashboard and public) share this layout.
 * Add tenant-specific providers (auth context, tenant data, etc.) here later.
 */
export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
