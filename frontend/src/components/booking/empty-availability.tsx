"use client";

import { Calendar, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

interface EmptyAvailabilityProps {
  date?: string;
  partySize?: number;
  onChangeDate?: () => void;
  onChangePartySize?: () => void;
}

export function EmptyAvailability({
  date,
  partySize,
  onChangeDate,
}: EmptyAvailabilityProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-center justify-center py-10 px-6 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Calendar className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      </div>

      <h3 className="mb-1.5 text-base font-semibold text-foreground">
        No availability
      </h3>
      <p className="mb-6 max-w-xs text-sm text-muted-foreground">
        {date && partySize
          ? `There are no available tables for ${partySize} guest${partySize > 1 ? "s" : ""} on this date. Try a different date or party size.`
          : "Select a date and party size to see available time slots."}
      </p>

      {onChangeDate && (
        <Button
          onClick={onChangeDate}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          Choose a Different Date
        </Button>
      )}
    </motion.div>
  );
}
