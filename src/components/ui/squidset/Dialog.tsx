import React from 'react';
import { cn } from '@/lib/utils';
import { X } from '@/lib/icon-map';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export const Dialog: React.FC<DialogProps> = ({ open, onClose, children, className }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Dialog Content */}
      <div 
        className={cn(
          'relative z-10 w-full max-w-md',
          'bg-white rounded-2xl shadow-2xl',
          'animate-in fade-in-0 zoom-in-95 duration-200',
          className
        )}
      >
        {children}
      </div>
    </div>
  );
};

export interface DialogHeaderProps {
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

export const DialogHeader: React.FC<DialogHeaderProps> = ({ children, onClose, className }) => {
  return (
    <div className={cn('px-6 py-5 border-b border-squid-gray-100 flex items-center justify-between', className)}>
      <div className="flex-1">{children}</div>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-4 p-1.5 rounded-lg hover:bg-squid-gray-100 transition-colors"
        >
          <X className="w-5 h-5 text-squid-gray-400" />
        </button>
      )}
    </div>
  );
};

export interface DialogTitleProps {
  children: React.ReactNode;
  className?: string;
}

export const DialogTitle: React.FC<DialogTitleProps> = ({ children, className }) => {
  return (
    <h2 className={cn('text-xl font-semibold text-squid-gray-900', className)}>
      {children}
    </h2>
  );
};

export interface DialogDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export const DialogDescription: React.FC<DialogDescriptionProps> = ({ children, className }) => {
  return (
    <p className={cn('mt-1 text-sm text-squid-gray-600', className)}>
      {children}
    </p>
  );
};

export interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
}

export const DialogContent: React.FC<DialogContentProps> = ({ children, className }) => {
  return (
    <div className={cn('px-6 py-5', className)}>
      {children}
    </div>
  );
};

export interface DialogFooterProps {
  children: React.ReactNode;
  className?: string;
}

export const DialogFooter: React.FC<DialogFooterProps> = ({ children, className }) => {
  return (
    <div className={cn('px-6 py-4 bg-squid-gray-50 rounded-b-2xl flex items-center justify-end gap-3', className)}>
      {children}
    </div>
  );
};
