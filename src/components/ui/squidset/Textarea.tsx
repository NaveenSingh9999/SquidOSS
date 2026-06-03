import React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-squid-gray-700 mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={cn(
            'w-full px-4 py-3',
            'bg-white border rounded-lg',
            'text-sm text-squid-gray-900 placeholder:text-squid-gray-400',
            'transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-squid-blue-500 focus:border-transparent',
            'disabled:bg-squid-gray-50 disabled:text-squid-gray-400 disabled:cursor-not-allowed',
            'resize-y min-h-[100px]',
            error ? 'border-squid-error' : 'border-squid-gray-200',
            className
          )}
          {...props}
        />
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

Textarea.displayName = 'Textarea';
