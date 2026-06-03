import React from 'react';
import { cn } from '@/lib/utils';

export interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ value, onValueChange, children, className }) => {
  return (
    <div className={cn('w-full', className)} data-value={value}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, { value, onValueChange } as any);
        }
        return child;
      })}
    </div>
  );
};

export interface TabsListProps {
  children: React.ReactNode;
  className?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

export const TabsList: React.FC<TabsListProps> = ({ children, className, value, onValueChange }) => {
  return (
    <div 
      className={cn(
        'inline-flex items-center gap-1 p-1',
        'bg-squid-gray-100 rounded-lg',
        className
      )}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, { 
            'data-active': child.props.value === value,
            onClick: () => onValueChange?.(child.props.value)
          } as any);
        }
        return child;
      })}
    </div>
  );
};

export interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
  'data-active'?: boolean;
  onClick?: () => void;
}

export const TabsTrigger: React.FC<TabsTriggerProps> = ({ 
  children, 
  className, 
  'data-active': isActive,
  onClick
}) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-2 rounded-md text-sm font-medium transition-all duration-150',
        'focus:outline-none focus:ring-2 focus:ring-squid-blue-500 focus:ring-offset-2',
        isActive 
          ? 'bg-white text-squid-gray-900 shadow-sm'
          : 'text-squid-gray-600 hover:text-squid-gray-900 hover:bg-white/50',
        className
      )}
    >
      {children}
    </button>
  );
};

export interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export const TabsContent: React.FC<TabsContentProps> = ({ value: contentValue, children, className }) => {
  const parent = React.useContext(TabsContext);
  const isActive = parent?.value === contentValue;

  if (!isActive) return null;

  return (
    <div className={cn('mt-4', className)}>
      {children}
    </div>
  );
};

const TabsContext = React.createContext<{ value: string } | null>(null);
