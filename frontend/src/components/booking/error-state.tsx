"use client";

import { AlertCircle, WifiOff, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  isNetworkError?: boolean;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this page. Please try again.",
  onRetry,
  isNetworkError = false,
  className,
}: ErrorStateProps) {
  const Icon = isNetworkError ? WifiOff : AlertCircle;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`flex flex-col items-center justify-center py-16 px-6 text-center ${className ?? ""}`}
    >
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
        <Icon className="h-10 w-10 text-destructive" aria-hidden="true" />
      </div>

      <h2 className="mb-2 text-xl font-semibold text-foreground">{title}</h2>
      <p className="mb-8 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>

      {onRetry && (
        <Button
          onClick={onRetry}
          variant="outline"
          size="lg"
          className="gap-2"
          aria-label="Retry"
        >
          <RefreshCcw className="h-4 w-4" />
          Try Again
        </Button>
      )}
    </motion.div>
  );
}

// =============================================================
// Cafe Not Found
// =============================================================
export function CafeNotFound({ slug }: { slug: string }) {
  return (
    <ErrorState
      title="Restaurant not found"
      description={`We couldn't find a restaurant at "${slug}". Please check the link and try again.`}
    />
  );
}
