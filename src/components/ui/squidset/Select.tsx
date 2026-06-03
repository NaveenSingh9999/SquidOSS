import React from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from '@/lib/icon-map';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helperText, children, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-squid-gray-700 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            className={cn(
              'w-full appearance-none',
              'px-4 py-2.5 pr-10',
              'bg-white border rounded-lg',
              'text-sm text-squid-gray-900',
              'transition-all duration-150',
              'focus:outline-none focus:ring-2 focus:ring-squid-blue-500 focus:border-transparent',
              'disabled:bg-squid-gray-50 disabled:text-squid-gray-400 disabled:cursor-not-allowed',
              error ? 'border-squid-error' : 'border-squid-gray-200',
              className
            )}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-squid-gray-400 pointer-events-none" />
        </div>
        {error && (
          <p className="mt-1.5 text-xs text-squid-error">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1.5 text-xs text-squid-gray-500">{helperText}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
