import { Loader2 } from 'lucide-react';

// Shared body for route segment loading.tsx files (L-01) -- gives Next.js a
// Suspense boundary to show during navigation/data-fetch instead of a blank
// page while a segment's server work resolves.
export function LoadingFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-background" role="status" aria-label="Loading">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
