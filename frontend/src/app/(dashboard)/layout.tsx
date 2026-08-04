import { HostDashboardLayoutView } from '@/components/pages/dashboard/HostDashboardLayoutView';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <HostDashboardLayoutView>{children}</HostDashboardLayoutView>;
}
