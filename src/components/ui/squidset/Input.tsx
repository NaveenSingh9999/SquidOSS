import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helper, icon, className, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-sm font-medium text-squid-gray-700">
            {label}
          </label>
        )}

        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-squid-gray-400">
              {icon}
            </div>
          )}

          <input
            ref={ref}
            className={cn(
              'w-full px-3 py-2',
              icon && 'pl-10',
              'text-sm text-squid-gray-900',
              'bg-white',
              'border border-squid-gray-300',
              'rounded-md',
              'placeholder:text-squid-gray-400',
              'focus:outline-none focus:ring-2 focus:ring-squid-blue-500 focus:border-transparent',
              'disabled:bg-squid-gray-50 disabled:cursor-not-allowed',
              error && 'border-squid-error focus:ring-squid-error',
              className
            )}
            {...props}
          />
        </div>

        {helper && !error && (
          <p className="text-xs text-squid-gray-500">{helper}</p>
        )}

        {error && (
          <p className="text-xs text-squid-error">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
