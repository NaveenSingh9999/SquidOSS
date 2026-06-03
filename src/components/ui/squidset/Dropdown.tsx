import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from '@/lib/icon-map';

export interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({ 
  trigger, 
  children, 
  align = 'left',
  className 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className={cn('relative inline-block', className)}>
      <div onClick={() => setIsOpen(!isOpen)}>
        {trigger}
      </div>
      
      {isOpen && (
        <div 
          className={cn(
            'absolute z-50 mt-2 min-w-[200px]',
            'bg-white rounded-lg shadow-lg border border-squid-gray-200',
            'py-1',
            'animate-in fade-in-0 zoom-in-95 duration-100',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {React.Children.map(children, (child) => {
            if (React.isValidElement(child)) {
              return React.cloneElement(child, {
                onClick: (e: any) => {
                  child.props.onClick?.(e);
                  setIsOpen(false);
                }
              } as any);
            }
            return child;
          })}
        </div>
      )}
    </div>
  );
};

export interface DropdownItemProps extends React.HTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  danger?: boolean;
}

export const DropdownItem: React.FC<DropdownItemProps> = ({ 
  children, 
  icon, 
  danger,
  className,
  ...props 
}) => {
  return (
    <button
      className={cn(
        'w-full px-4 py-2 text-left text-sm',
        'flex items-center gap-3',
        'transition-colors duration-150',
        danger 
          ? 'text-squid-error hover:bg-red-50'
          : 'text-squid-gray-700 hover:bg-squid-gray-50',
        className
      )}
      {...props}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span className="flex-1">{children}</span>
    </button>
  );
};

export const DropdownSeparator: React.FC = () => {
  return <div className="my-1 h-px bg-squid-gray-200" />;
};
