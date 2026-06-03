import React, { useRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedControlOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  variant?: 'default' | 'squidcloud';
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  value,
  onChange,
  className,
  size = 'md',
  fullWidth = false,
  variant = 'default',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [gradientStyle, setGradientStyle] = useState({ left: 0, width: 0 });
  
  const currentIndex = options.findIndex(opt => opt.value === value);

  // Calculate gradient position based on actual button dimensions
  useEffect(() => {
    if (containerRef.current && currentIndex >= 0) {
      const buttons = containerRef.current.querySelectorAll('button');
      const activeButton = buttons[currentIndex] as HTMLElement;
      
      if (activeButton) {
        setGradientStyle({
          left: activeButton.offsetLeft,
          width: activeButton.offsetWidth,
        });
      }
    }
  }, [currentIndex, options]);

  const sizeClasses = {
    sm: 'h-9 text-xs',
    md: 'h-11 text-sm', // Increased from h-10 to h-11
    lg: 'h-14 text-base', // Increased from h-12 to h-14
  };

  const buttonPadding = {
    sm: 'px-4 py-2',
    md: 'px-6 py-2.5', // Increased padding for wider tabs
    lg: 'px-8 py-3',
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative inline-flex items-center',
        'border border-slate-600/30 rounded-lg overflow-hidden',
        'bg-slate-900/40', // Subtle background
        fullWidth && 'w-full',
        className
      )}
      role="tablist"
    >
      {/* Animated background indicator - Precise positioning */}
      <div
        className="absolute top-0 bottom-0 transition-all duration-200 ease-out pointer-events-none"
        style={{
          background: 'linear-gradient(to right, rgb(37 99 235), rgb(147 51 234))',
          left: `${gradientStyle.left}px`,
          width: `${gradientStyle.width}px`,
        }}
      />

      {/* Buttons */}
      {options.map((option, index) => {
        const isActive = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={option.disabled}
            onClick={() => !option.disabled && onChange(option.value)}
            className={cn(
              'relative flex items-center justify-center gap-2',
              'font-medium transition-colors duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50',
              'whitespace-nowrap z-10',
              sizeClasses[size],
              buttonPadding[size],
              fullWidth && 'flex-1',
              isActive
                ? 'text-white'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            {/* Icon - properly rendered, not passed as object */}
            {option.icon}
            <span className="whitespace-nowrap hidden sm:inline">{option.label}</span>
            <span className="whitespace-nowrap sm:hidden text-[10px]">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default SegmentedControl;
