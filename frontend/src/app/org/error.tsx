'use client';

import { ErrorFallback } from '@/components/shared/error-fallback';

export default function OrgError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorFallback error={error} reset={reset} homeHref="/org/dashboard" homeLabel="Back to dashboard" />;
}
