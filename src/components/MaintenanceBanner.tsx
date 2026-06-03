import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, X } from '@/lib/icon-map';
import { useMaintenanceMode } from '@/hooks/use-maintenance-mode';
import { Button } from '@/components/ui/button';

const DISMISS_PREFIX = 'maintenance_banner_dismissed';

const MaintenanceBanner = () => {
  const { maintenanceMode, loading } = useMaintenanceMode();
  const [dismissed, setDismissed] = useState(false);

  const dismissKey = useMemo(
    () => `${DISMISS_PREFIX}:${maintenanceMode.message || 'default'}`,
    [maintenanceMode.message]
  );

  useEffect(() => {
    const cached = localStorage.getItem(dismissKey);
    setDismissed(cached === '1');
  }, [dismissKey]);

  if (loading || !maintenanceMode.enabled || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    localStorage.setItem(dismissKey, '1');
    setDismissed(true);
  };

  return (
    <div className="w-full border-y border-red-700/60 bg-red-600 text-white animate-in slide-in-from-top">
      <div className="mx-auto flex min-h-8 max-w-[1500px] items-center gap-2 px-3 py-1 text-xs sm:text-sm">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <p className="flex-1 truncate font-medium">{maintenanceMode.message}</p>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDismiss}
          className="h-6 w-6 shrink-0 text-white hover:bg-red-700/40 hover:text-white"
          aria-label="Dismiss maintenance notification"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};

export default MaintenanceBanner;
