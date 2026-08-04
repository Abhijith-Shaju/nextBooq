import { TenantBookingWizardView } from '@/components/pages/booking/TenantBookingWizardView';

interface TenantBookPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function TenantBookPage({ params }: TenantBookPageProps) {
  const resolvedParams = await params;
  const slug = resolvedParams.tenant || 'centralperk';
  const cafeName = slug.charAt(0).toUpperCase() + slug.slice(1) + ' Cafe';

  return (
    <TenantBookingWizardView
      cafeId={`cafe-${slug}`}
      cafeName={cafeName}
      slug={slug}
    />
  );
}
