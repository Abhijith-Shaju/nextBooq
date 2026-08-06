"use client";

import { Skeleton } from "@/components/ui/skeleton";

// =============================================================
// Hero Skeleton
// =============================================================
export function HeroSkeleton() {
  return (
    <div className="relative h-[70vh] min-h-[520px] w-full bg-muted animate-pulse">
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-20 px-6 text-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-80" />
        <Skeleton className="h-12 w-40 rounded-xl" />
      </div>
    </div>
  );
}

// =============================================================
// Booking Card Skeleton
// =============================================================
export function BookingCardSkeleton() {
  return (
    <div className="w-full max-w-2xl mx-auto p-6 rounded-2xl border border-border bg-card shadow-luxury space-y-6">
      <Skeleton className="h-7 w-48" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      </div>
      <Skeleton className="h-12 w-full rounded-xl" />
    </div>
  );
}

// =============================================================
// Time Slot Grid Skeleton
// =============================================================
export function TimeSlotGridSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-36" />
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// =============================================================
// Checkout Card Skeleton
// =============================================================
export function CheckoutSkeleton() {
  return (
    <div className="w-full max-w-lg mx-auto space-y-4">
      <div className="p-6 rounded-2xl border border-border bg-card shadow-luxury space-y-4">
        <Skeleton className="h-7 w-48" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="h-14 w-full rounded-xl" />
    </div>
  );
}

// =============================================================
// Success Card Skeleton
// =============================================================
export function SuccessSkeleton() {
  return (
    <div className="w-full max-w-lg mx-auto space-y-6 text-center">
      <Skeleton className="h-24 w-24 rounded-full mx-auto" />
      <Skeleton className="h-8 w-64 mx-auto" />
      <Skeleton className="h-5 w-48 mx-auto" />
      <div className="p-6 rounded-2xl border border-border bg-card space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================
// Generic Page Skeleton
// =============================================================
export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-background animate-pulse">
      <HeroSkeleton />
      <div className="container mx-auto px-4 -mt-16 pb-20">
        <BookingCardSkeleton />
      </div>
    </div>
  );
}
