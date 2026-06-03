/**
 * PIN Protected Content Wrapper
 * Enforces PIN authentication before showing protected content
 */

import React, { useEffect, useState } from 'react';
import { usePINAuthContext } from '@/contexts/PINAuthContext';
import { SecurityOperation } from '@/services/pinAuthService';
import { Loader2 } from '@/lib/icon-map';

interface PINProtectedContentProps {
  children: React.ReactNode;
  operation: SecurityOperation;
  fallback?: React.ReactNode;
}

export const PINProtectedContent: React.FC<PINProtectedContentProps> = ({
  children,
  operation,
  fallback
}) => {
  const { hasPIN, requirePIN, isLoading } = usePINAuthContext();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    checkAuth();
  }, [hasPIN, operation]);

  const checkAuth = async () => {
    setIsChecking(true);
    
    // If no PIN is set, allow access
    if (!hasPIN) {
      setIsAuthorized(true);
      setIsChecking(false);
      return;
    }

    // Check if PIN is required for this operation
    await requirePIN(operation, () => {
      setIsAuthorized(true);
    });
    
    setIsChecking(false);
  };

  if (isLoading || isChecking) {
    return fallback || (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthorized && hasPIN) {
    return fallback || null;
  }

  return <>{children}</>;
};
