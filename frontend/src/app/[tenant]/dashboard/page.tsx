import { redirect } from "next/navigation";

interface DashboardPageProps {
  params: Promise<{ tenant: string }>;
}

// The dashboard root redirects to the reservations manifest
export default async function DashboardPage({ params }: DashboardPageProps) {
  const { tenant } = await params;
  redirect(`/${tenant}/reservations`);
}
