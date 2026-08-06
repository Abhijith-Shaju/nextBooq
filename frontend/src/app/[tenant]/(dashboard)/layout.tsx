/**
 * [tenant]/(dashboard) layout.
 * Wraps dashboard pages (tables, reservations, settings) for a specific tenant.
 * Add sidebar navigation, auth guards, and owner context here.
 */
export default function TenantDashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
