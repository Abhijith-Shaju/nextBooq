'use client';

import { useParams } from 'next/navigation';
import { useCafeApplication } from '@/hooks/admin/use-cafe-applications';
import { CafeApplicationReview } from '@/components/admin/cafe-application-review';

export default function CafeApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id || '';
  const { data: application, isLoading } = useCafeApplication(id);

  if (isLoading) {
    return <p className="text-sm text-slate-600">Loading…</p>;
  }

  if (!application) {
    return <p className="text-sm text-slate-600">Application not found.</p>;
  }

  return <CafeApplicationReview application={application} />;
}
