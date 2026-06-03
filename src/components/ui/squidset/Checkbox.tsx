import React from 'react';
import { cn } from '@/lib/utils';
import { Check } from '@/lib/icon-map';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => {
    const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;
    
    return (
      <div className="flex items-center">
        <div className="relative inline-flex items-center">
          <input
            ref={ref}
            id={checkboxId}
            type="checkbox"
            className={cn(
              'peer w-5 h-5 appearance-none',
              'border-2 border-squid-gray-300 rounded',
              'transition-all duration-150',
              'focus:outline-none focus:ring-2 focus:ring-squid-blue-500 focus:ring-offset-2',
              'checked:bg-squid-blue-600 checked:border-squid-blue-600',
              'disabled:bg-squid-gray-100 disabled:cursor-not-allowed',
              className
            )}
            {...props}
          />
          <Check 
            className="absolute left-0.5 top-0.5 w-4 h-4 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity duration-150" 
          />
        </div>
        {label && (
          <label
            htmlFor={checkboxId}
            className="ml-2 text-sm text-squid-gray-700 cursor-pointer select-none"
          >
            {label}
          </label>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
