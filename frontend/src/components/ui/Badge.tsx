import React from 'react';
import { cn } from '@/lib/utils';
import { ReservationStatus } from '@/types';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  status?: ReservationStatus | string;
}

export function Badge({ className, variant = 'default', status, children, ...props }: BadgeProps) {
  let styleClass = 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700';

  if (status) {
    switch (status) {
      case 'CONFIRMED':
      case 'active':
      case 'ACTIVE':
        styleClass = 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
        break;
      case 'SEATED':
        styleClass = 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 font-semibold';
        break;
      case 'CHECKED_IN':
        styleClass = 'bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800';
        break;
      case 'HOLD':
      case 'PENDING_PAYMENT':
      case 'past_due':
        styleClass = 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 animate-pulse';
        break;
      case 'CANCELLED':
      case 'EXPIRED':
      case 'SUSPENDED':
      case 'NO_SHOW':
        styleClass = 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
        break;
      case 'COMPLETED':
        styleClass = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700';
        break;
    }
  } else if (variant === 'success') {
    styleClass = 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
  } else if (variant === 'warning') {
    styleClass = 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
  } else if (variant === 'danger') {
    styleClass = 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
  } else if (variant === 'info') {
    styleClass = 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors',
        styleClass,
        className
      )}
      {...props}
    >
      {children || status}
    </span>
  );
}
