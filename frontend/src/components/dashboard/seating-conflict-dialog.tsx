'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface SeatingAlternate {
  tableNumbers: string[];
  totalCapacity: number;
}

export interface SeatingConflict {
  guestName: string;
  tableNumbers: string[];
  alternate?: SeatingAlternate;
}

interface SeatingConflictDialogProps {
  conflict: SeatingConflict | null;
  onOpenChange: (open: boolean) => void;
  onForceSeat: () => void;
  onReassign: () => void;
}

export function SeatingConflictDialog({
  conflict,
  onOpenChange,
  onForceSeat,
  onReassign,
}: SeatingConflictDialogProps) {
  const [showReassignStep, setShowReassignStep] = useState(false);

  // A fresh conflict — e.g. the suggested table got taken and the backend sent
  // the dialog back — should always land on step 1, never a stale confirm step.
  useEffect(() => {
    setShowReassignStep(false);
  }, [conflict]);

  if (!conflict) return null;

  const occupiedTables = conflict.tableNumbers.join(', ');
  const alternate = conflict.alternate;
  const alternateTables = alternate?.tableNumbers.join(', ');

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-6 rounded-3xl">
        {showReassignStep && alternate ? (
          <>
            <DialogHeader className="text-left">
              <DialogTitle className="font-display text-brand-brown">
                Move to Table {alternateTables}?
              </DialogTitle>
              <DialogDescription className="text-xs text-brand-mocha">
                This reservation will be reassigned to Table {alternateTables} (seats{' '}
                {alternate.totalCapacity}) and seated there.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4 flex-row justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowReassignStep(false)}>
                Back
              </Button>
              <Button type="button" onClick={onReassign}>
                Confirm
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="text-left">
              <DialogTitle className="font-display text-brand-brown">
                Table {occupiedTables} is already occupied
              </DialogTitle>
              <DialogDescription className="text-xs text-brand-mocha">
                {conflict.guestName} is currently seated there.
                {alternate
                  ? ` Table ${alternateTables} is free — you can move this party there instead.`
                  : ' You can seat this party anyway if you know the table is actually free.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4 flex-row justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={onForceSeat}>
                Seat Anyway
              </Button>
              {alternate && (
                <Button type="button" onClick={() => setShowReassignStep(true)}>
                  Reassign
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
