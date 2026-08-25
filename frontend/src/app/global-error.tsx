'use client';

import { useEffect } from 'react';

// Catches a throw in the root layout itself, which nothing else in this
// tree can (L-01). Deliberately self-contained -- no shared components, no
// design tokens that depend on the root layout's own CSS having loaded --
// since this only renders when that layout has already failed. Must
// include its own <html>/<body>: it replaces the root layout entirely.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '24px',
          textAlign: 'center',
          background: '#fff',
          color: '#111',
        }}
      >
        <h1 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>Something went wrong</h1>
        <p style={{ color: '#666', maxWidth: '360px', marginBottom: '20px' }}>
          nextBooq hit an unexpected error. Please try again.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            borderRadius: '8px',
            background: '#111',
            color: '#fff',
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
