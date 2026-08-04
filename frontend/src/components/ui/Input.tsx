import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, type = 'text', ...props }, ref) => {
    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label className="text-xs font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-400">
            {label}
          </label>
        )}
        <input
          type={type}
          ref={ref}
          className={cn(
            'w-full px-4 py-2.5 rounded-xl text-sm transition-all duration-150',
            'bg-stone-50 dark:bg-stone-800/80 text-stone-900 dark:text-stone-100',
            'border border-stone-200 dark:border-stone-700/80 focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 outline-none',
            'placeholder:text-stone-400 dark:placeholder:text-stone-500',
            error && 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20',
            className
          )}
          {...props}
        />
        {error && <span className="text-xs font-medium text-rose-500">{error}</span>}
        {helperText && !error && (
          <span className="text-xs text-stone-400 dark:text-stone-500">{helperText}</span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
