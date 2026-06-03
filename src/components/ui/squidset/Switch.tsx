import React from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, label, id, ...props }, ref) => {
    const switchId = id || `switch-${Math.random().toString(36).substr(2, 9)}`;
    
    return (
      <div className="flex items-center">
        <div className="relative inline-block">
          <input
            ref={ref}
            id={switchId}
            type="checkbox"
            className="sr-only peer"
            {...props}
          />
          <div 
            className={cn(
              'w-11 h-6 rounded-full transition-colors duration-200',
              'bg-squid-gray-200 peer-checked:bg-squid-blue-600',
              'peer-focus:ring-2 peer-focus:ring-squid-blue-500 peer-focus:ring-offset-2',
              'peer-disabled:opacity-50 peer-disabled:cursor-not-allowed',
              className
            )}
          />
          <div 
            className={cn(
              'absolute left-0.5 top-0.5 w-5 h-5 rounded-full',
              'bg-white shadow-sm transition-transform duration-200',
              'peer-checked:translate-x-5'
            )}
          />
        </div>
        {label && (
          <label
            htmlFor={switchId}
            className="ml-3 text-sm text-squid-gray-700 cursor-pointer select-none"
          >
            {label}
          </label>
        )}
      </div>
    );
  }
);

Switch.displayName = 'Switch';
