import React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, children, ...props }, ref) => {
    const baseStyles = `
      inline-flex items-center justify-center
      font-medium transition-all duration-150
      focus:outline-none focus:ring-2 focus:ring-offset-2
      disabled:opacity-50 disabled:cursor-not-allowed
    `;

    const variants = {
      primary: `
        bg-squid-blue-600 text-white
        hover:bg-squid-blue-700
        focus:ring-squid-blue-500
        active:bg-squid-blue-800
      `,
      secondary: `
        bg-squid-gray-100 text-squid-gray-900
        hover:bg-squid-gray-200
        focus:ring-squid-gray-500
        border border-squid-gray-200
      `,
      ghost: `
        text-squid-gray-700
        hover:bg-squid-gray-100
        focus:ring-squid-gray-500
      `,
      danger: `
        bg-squid-error text-white
        hover:bg-red-600
        focus:ring-squid-error
      `,
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm rounded-md',
      md: 'px-4 py-2 text-sm rounded-md',
      lg: 'px-5 py-2.5 text-base rounded-lg',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
