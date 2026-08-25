'use client';

import Link from 'next/link';
import { useEffect } from 'react';

interface ErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Where the "Go back" link should point. Defaults to the site root. */
  homeHref?: string;
  homeLabel?: string;
}

// Shared body for every route segment's error.tsx (L-01) -- before this,
// a render-time throw anywhere fell through to the framework's bare
// default in production: a blank screen, no way back except changing the
// URL by hand.
export function ErrorFallback({ error, reset, homeHref = '/', homeLabel = 'Go home' }: ErrorFallbackProps) {
  useEffect(() => {
    console.error('[ErrorFallback]', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center bg-background px-6 text-center">
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
        <p className="text-muted-foreground max-w-sm">
          We hit an unexpected error loading this page. You can try again, or head back and pick up
          from there.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
          <Link
            href={homeHref}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            {homeLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
