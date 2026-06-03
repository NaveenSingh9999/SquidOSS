/**
 * Toast Component - SquidCloud styled toast notifications
 */

import React, { useState, useEffect } from 'react';
import { ToastOptions } from '../types';

export interface ToastProps extends ToastOptions {
  message: string;
  id: string;
  onClose: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'info',
  duration = 3000,
  position = 'top-right',
  id,
  onClose
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onClose(id), 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, id, onClose]);

  const typeStyles = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500'
  };

  const typeIcons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4'
  };

  return (
    <div
      className={`
        fixed ${positionClasses[position]} z-50
        transform transition-all duration-300 ease-in-out
        ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
    >
      <div className={`${typeStyles[type]} text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px]`}>
        <span className="text-xl font-bold">{typeIcons[type]}</span>
        <p className="flex-1">{message}</p>
        <button
          onClick={() => {
            setIsVisible(false);
            setTimeout(() => onClose(id), 300);
          }}
          className="text-white hover:text-gray-200 transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

// Toast manager
let toastId = 0;
const toastCallbacks: ((toast: ToastProps) => void)[] = [];

export const showToast = (message: string, options: ToastOptions = {}) => {
  const id = `toast-${toastId++}`;
  const toast: ToastProps = {
    message,
    id,
    onClose: () => {},
    ...options
  };

  toastCallbacks.forEach(callback => callback(toast));
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  useEffect(() => {
    const callback = (toast: ToastProps) => {
      setToasts(prev => [...prev, toast]);
    };

    toastCallbacks.push(callback);

    return () => {
      const index = toastCallbacks.indexOf(callback);
      if (index > -1) toastCallbacks.splice(index, 1);
    };
  }, []);

  const handleClose = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <>
      {toasts.map(toast => (
        <Toast key={toast.id} {...toast} onClose={handleClose} />
      ))}
    </>
  );
};
