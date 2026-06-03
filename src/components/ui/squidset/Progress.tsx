import React from 'react';
import { cn } from '@/lib/utils';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  showLabel?: boolean;
  variant?: 'default' | 'success' | 'warning' | 'error';
}

const variantColors = {
  default: 'bg-squid-blue-600',
  success: 'bg-green-600',
  warning: 'bg-yellow-600',
  error: 'bg-red-600',
};

export const Progress: React.FC<ProgressProps> = ({
  value,
  max = 100,
  showLabel = false,
  variant = 'default',
  className,
  ...props
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div className={cn('w-full', className)} {...props}>
      <div className="relative w-full h-2 bg-squid-gray-200 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full transition-all duration-300 ease-out rounded-full',
            variantColors[variant]
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <p className="mt-1 text-xs text-squid-gray-600 text-right">
          {Math.round(percentage)}%
        </p>
      )}
    </div>
  );
};
