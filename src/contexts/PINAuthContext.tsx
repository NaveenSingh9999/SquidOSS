/**
 * PIN Authentication Context
 * Provides centralized PIN authentication across the app
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { pinAuthService, type SecurityOperation, type PINSettings } from '@/services/pinAuthService';
import PINAuthDialog from '@/components/PINAuthDialog';
import { supabase } from '@/integrations/supabase/client';

interface PINAuthContextType {
  settings: PINSettings | null;
  isLoading: boolean;
  hasPIN: boolean;
  requirePIN: (operation: SecurityOperation, onSuccess: () => void) => Promise<void>;
  verifyOperationNow: (operation: SecurityOperation) => Promise<boolean>;
  refreshSettings: () => Promise<void>;
}

const PINAuthContext = createContext<PINAuthContextType | undefined>(undefined);

export const PINAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<PINSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasPIN, setHasPIN] = useState(false);
  const [showPINDialog, setShowPINDialog] = useState(false);
  const [currentOperation, setCurrentOperation] = useState<SecurityOperation | null>(null);
  const [onSuccessCallback, setOnSuccessCallback] = useState<(() => void) | null>(null);
  const pendingResolverRef = useRef<((value: boolean) => void) | null>(null);

  // Load PIN settings on mount and when user changes
  const refreshSettings = useCallback(async () => {
    if (!user) {
      setSettings(null);
      setHasPIN(false);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      // Single query instead of two parallel queries
      const userSettings = await pinAuthService.getSettings(user.id);

      setHasPIN(userSettings?.pinEnabled ?? false);
      setSettings(userSettings);
    } catch (error) {
      console.error('Failed to load PIN settings:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshSettings();
  }, [user]); // Changed from [refreshSettings] to [user] to prevent unnecessary re-renders

  /**
   * Require PIN for a specific operation
   * This will check if PIN is enabled and required for the operation,
   * then show the PIN dialog if needed
   */
  const requirePIN = useCallback(async (
    operation: SecurityOperation,
    onSuccess: () => void
  ) => {
    if (!user) {
      onSuccess();
      return;
    }

    // Use cached hasPIN state instead of making another query
    if (!hasPIN) {
      onSuccess();
      return;
    }

    // Check if PIN is required for this operation
    const isPINRequired = await pinAuthService.requiresPIN(user.id, operation);

    if (!isPINRequired) {
      // PIN not required, execute directly
      onSuccess();
      return;
    }

    // PIN is required, show dialog
    setCurrentOperation(operation);
    setOnSuccessCallback(() => onSuccess);
    setShowPINDialog(true);
  }, [user, hasPIN]);

  const verifyOperationNow = useCallback(async (operation: SecurityOperation): Promise<boolean> => {
    if (!user) return false;

    // Use cached hasPIN state instead of making another query
    if (!hasPIN) {
      return true;
    }

    const isPINRequired = await pinAuthService.requiresPIN(user.id, operation);
    if (!isPINRequired) {
      return true;
    }

    return await new Promise<boolean>((resolve) => {
      setCurrentOperation(operation);
      setOnSuccessCallback(null);
      pendingResolverRef.current = resolve;
      setShowPINDialog(true);
    });
  }, [user, hasPIN]);

  const handlePINSuccess = useCallback(async (_pin: string) => {
    const operation = currentOperation;

    if (operation && user) {
      await supabase.rpc('grant_pin_operation_authorization', {
        operation_type: operation,
        ttl_seconds: operation === 'app_startup' ? Math.max((settings?.pinTimeout ?? 5) * 60, 60) : 120,
      });
    }

    setShowPINDialog(false);

    if (operation === 'app_startup' && user) {
      await pinAuthService.markAppStartupAuth(user.id);
    }
    
    // Execute the callback
    if (onSuccessCallback) {
      onSuccessCallback();
    }

    if (pendingResolverRef.current) {
      pendingResolverRef.current(true);
    }
    
    // Cleanup
    setCurrentOperation(null);
    setOnSuccessCallback(null);
    pendingResolverRef.current = null;
  }, [currentOperation, onSuccessCallback, settings?.pinTimeout, user]);

  const handlePINCancel = useCallback(() => {
    setShowPINDialog(false);
    if (pendingResolverRef.current) {
      pendingResolverRef.current(false);
    }
    setCurrentOperation(null);
    setOnSuccessCallback(null);
    pendingResolverRef.current = null;
  }, []);

  const value: PINAuthContextType = {
    settings,
    isLoading,
    hasPIN,
    requirePIN,
    verifyOperationNow,
    refreshSettings
  };

  return (
    <PINAuthContext.Provider value={value}>
      {children}
      
      {/* Global PIN Dialog */}
      <PINAuthDialog
        open={showPINDialog}
        onClose={handlePINCancel}
        onSuccess={handlePINSuccess}
        title="PIN Required"
        description={`Enter your PIN to ${getOperationDescription(currentOperation)}`}
        operation={currentOperation || undefined}
      />
    </PINAuthContext.Provider>
  );
};

export const usePINAuthContext = () => {
  const context = useContext(PINAuthContext);
  if (context === undefined) {
    throw new Error('usePINAuthContext must be used within a PINAuthProvider');
  }
  return context;
};

function getOperationDescription(operation: SecurityOperation | null): string {
  switch (operation) {
    case 'open_vault':
      return 'access SquidVault';
    case 'create_share':
      return 'create or manage shares';
    case 'revoke_share':
      return 'revoke sharing access';
    case 'view_security_settings':
      return 'access security settings';
    case 'delete_files':
      return 'delete files';
    case 'export_data':
      return 'export data';
    default:
      return 'continue';
  }
}
