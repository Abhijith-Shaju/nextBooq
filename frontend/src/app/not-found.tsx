import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
      <div className="space-y-4">
        <h1 className="text-6xl font-bold text-foreground">404</h1>
        <h2 className="text-xl font-semibold text-foreground">
          Restaurant not found
        </h2>
        <p className="text-muted-foreground max-w-sm">
          We couldn&apos;t find the restaurant you&apos;re looking for. Please check the
          link and try again.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 mt-4 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
