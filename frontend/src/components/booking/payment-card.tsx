"use client";

import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { motion } from "framer-motion";

type PaymentStatus = "idle" | "processing" | "polling" | "success" | "failed";

interface PaymentCardProps {
  status: PaymentStatus;
  message?: string;
}

export function PaymentCard({ status, message }: PaymentCardProps) {
  const icons: Record<PaymentStatus, React.ReactNode> = {
    idle: null,
    processing: (
      <Loader2 className="h-8 w-8 animate-spin text-brand" aria-hidden="true" />
    ),
    polling: (
      <Loader2 className="h-8 w-8 animate-spin text-brand" aria-hidden="true" />
    ),
    success: (
      <CheckCircle className="h-8 w-8 text-emerald-500" aria-hidden="true" />
    ),
    failed: (
      <XCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
    ),
  };

  const labels: Record<PaymentStatus, string> = {
    idle: "",
    processing: "Opening payment gateway…",
    polling: "Confirming your payment…",
    success: "Payment confirmed!",
    failed: "Payment failed",
  };

  if (status === "idle") return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center"
      role="status"
      aria-live="polite"
      aria-label={labels[status]}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        {icons[status]}
      </div>
      <div>
        <p className="font-semibold text-foreground">{labels[status]}</p>
        {message && (
          <p className="text-sm text-muted-foreground mt-1">{message}</p>
        )}
      </div>
    </motion.div>
  );
}
