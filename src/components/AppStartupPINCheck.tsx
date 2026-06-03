/**
 * App Startup PIN Check
 * Checks if PIN is required on app startup
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { usePINAuthContext } from '@/contexts/PINAuthContext';
import { Loader2 } from '@/lib/icon-map';

interface AppStartupPINCheckProps {
  children: React.ReactNode;
}

export const AppStartupPINCheck: React.FC<AppStartupPINCheckProps> = ({ children }) => {
  const { hasPIN, requirePIN, isLoading, settings } = usePINAuthContext();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const startupCheckCompleted = useRef(false);

  const markAuthorized = useCallback(() => {
    startupCheckCompleted.current = true;
    setIsAuthorized(true);
    setHasChecked(true);
  }, []);

  const checkStartupPIN = useCallback(async () => {
    if (startupCheckCompleted.current || hasChecked) {
      return;
    }

    if (isLoading) {
      return;
    }

    // If no PIN or PIN not required on startup, allow access
    if (!hasPIN || !settings?.requirePinOnStartup) {
      markAuthorized();
      return;
    }

    // Check if already authenticated recently
    if (settings.lastPinAuth) {
      const lastAuth = new Date(settings.lastPinAuth).getTime();
      const now = Date.now();
      const minutesSinceAuth = (now - lastAuth) / 60000;
      
      if (minutesSinceAuth < settings.pinTimeout) {
        markAuthorized();
        return;
      }
    }

    // Require PIN for app startup
    await requirePIN('app_startup', () => {
      markAuthorized();
    });
  }, [hasPIN, hasChecked, isLoading, markAuthorized, requirePIN, settings]);

  useEffect(() => {
    if (!hasChecked) {
      checkStartupPIN();
    }
  }, [checkStartupPIN, hasChecked]);

  if (!hasChecked && isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Initializing...</p>
        </div>
      </div>
    );
  }

  if (!hasChecked) {
    return null;
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">Please authenticate to continue</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
