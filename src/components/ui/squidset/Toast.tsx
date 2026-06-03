import React from 'react';
import { cn } from '@/lib/utils';
import { X, CheckCircle, AlertCircle, Info, XCircle } from '@/lib/icon-map';

export interface ToastProps {
  title: string;
  description?: string;
  variant?: 'default' | 'success' | 'error' | 'warning';
  onClose?: () => void;
  className?: string;
}

const variantStyles = {
  default: 'bg-white border-squid-gray-200',
  success: 'bg-green-50 border-green-200',
  error: 'bg-red-50 border-red-200',
  warning: 'bg-yellow-50 border-yellow-200',
};

const variantIcons = {
  default: Info,
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
};

const variantIconColors = {
  default: 'text-squid-blue-600',
  success: 'text-green-600',
  error: 'text-red-600',
  warning: 'text-yellow-600',
};

export const Toast: React.FC<ToastProps> = ({
  title,
  description,
  variant = 'default',
  onClose,
  className
}) => {
  const Icon = variantIcons[variant];

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border shadow-lg',
        'animate-in slide-in-from-top-5 duration-300',
        variantStyles[variant],
        className
      )}
    >
      <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', variantIconColors[variant])} />
      
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-squid-gray-900">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-squid-gray-600">{description}</p>
        )}
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 rounded hover:bg-squid-gray-100 transition-colors"
        >
          <X className="w-4 h-4 text-squid-gray-400" />
        </button>
      )}
    </div>
  );
};
