import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Loader2, ShieldCheck, Smartphone, Download } from '@/lib/icon-map';
import { supabase } from '@/integrations/supabase/client';
import NativeDownloader from '@/capacitor-plugins/native-downloader';

type UpdateStage =
  | 'idle'
  | 'checking'
  | 'update-found'
  | 'requesting-permission'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'awaiting-user-install'
  | 'failed';

interface AppUpdateInfo {
  id: string;
  platform: string;
  version: string;
  download_url: string;
  changelog?: string;
  is_mandatory?: boolean;
}

export const VersionChecker = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [forcedUpdate, setForcedUpdate] = useState<AppUpdateInfo | null>(null);
  const [stage, setStage] = useState<UpdateStage>('idle');
  const [statusMessage, setStatusMessage] = useState('Checking for updates…');
  const { toast } = useToast();

  const isNative = Capacitor.isNativePlatform();
  const isAndroidNative = isNative && Capacitor.getPlatform() === 'android';

  const compareVersions = (a: string, b: string): number => {
    const parse = (v: string) => v.split('.').map((part) => Number(part.replace(/[^\d]/g, '')) || 0);
    const aParts = parse(a);
    const bParts = parse(b);
    const len = Math.max(aParts.length, bParts.length);
    for (let i = 0; i < len; i += 1) {
      const av = aParts[i] ?? 0;
      const bv = bParts[i] ?? 0;
      if (av > bv) return 1;
      if (av < bv) return -1;
    }
    return 0;
  };

  const getRuntimeVersion = async (): Promise<string | null> => {
    if (isNative) {
      try {
        const info = await CapacitorApp.getInfo();
        return info.version ?? null;
      } catch {
        return null;
      }
    }

    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-cache' });
      const versionData = await res.json();
      return versionData?.version || null;
    } catch {
      return null;
    }
  };

  const getUpdatePlatform = (): string => {
    if (isAndroidNative) return 'android';
    return 'windows';
  };

  const runAndroidForcedUpdate = async (update: AppUpdateInfo): Promise<void> => {
    setStage('requesting-permission');
    setStatusMessage('Requesting install permissions…');

    const waitForInstallPermission = async (timeoutMs = 120000, intervalMs = 1500): Promise<boolean> =>
      new Promise((resolve) => {
        const startedAt = Date.now();
        const timer = setInterval(async () => {
          const elapsed = Date.now() - startedAt;
          if (elapsed >= timeoutMs) {
            clearInterval(timer);
            resolve(false);
            return;
          }
          try {
            const nextPermission = await NativeDownloader.canRequestPackageInstalls();
            if (nextPermission.allowed) {
              clearInterval(timer);
              resolve(true);
            }
          } catch {
            // keep polling until timeout
          }
        }, intervalMs);
      });

    let permission = await NativeDownloader.canRequestPackageInstalls();
    if (!permission.allowed) {
      await NativeDownloader.openInstallPermissionSettings();
      setStatusMessage('Enable install permission and return to continue…');
      const granted = await waitForInstallPermission();
      permission = { allowed: granted };
    }

    if (!permission.allowed) {
      throw new Error('Install permission not granted');
    }

    setStage('downloading');
    setStatusMessage('Pulling secure app update package…');
    const fileName = `squidcloud-update-${update.version}.apk`;
    const apkDownload = await NativeDownloader.downloadApkFromUrl({
      url: update.download_url,
      filename: fileName,
    });

    setStage('verifying');
    setStatusMessage('Verifying APK signature against installed app…');
    const verification = await NativeDownloader.verifyAndInstallApk({
      apkPath: apkDownload.apkPath,
    });

    if (!verification.verified) {
      throw new Error('APK signature verification failed');
    }

    if (verification.installIntentStarted) {
      setStage('installing');
      setStatusMessage('Installer opened. Complete installation to continue.');
    } else {
      setStage('awaiting-user-install');
      setStatusMessage('Install permission required. Please enable and return.');
    }
  };

  const runDesktopForcedUpdate = async (update: AppUpdateInfo): Promise<void> => {
    setStage('downloading');
    setStatusMessage('Pulling update package…');
    window.location.href = update.download_url;
  };

  const checkForcedAppUpdate = async (): Promise<void> => {
    try {
      setStage('checking');
      const platform = getUpdatePlatform();
      const currentVersion = await getRuntimeVersion();
      const { data, error } = await supabase.functions.invoke('get-app-updates', {
        body: { platform, currentVersion },
      });

      if (error) throw error;

      const latest: AppUpdateInfo | null = data?.latestVersion || null;
      if (!latest?.version || !latest?.download_url || !currentVersion) {
        setStage('idle');
        return;
      }

      const mustUpdate = compareVersions(latest.version, currentVersion) > 0;
      if (!mustUpdate) {
        setStage('idle');
        return;
      }

      setForcedUpdate(latest);
      setUpdateAvailable(true);
      setStage('update-found');

      toast({
        title: 'Mandatory Update Found',
        description: `Updating to v${latest.version}. Please wait…`,
        duration: 5000,
      });

      if (isAndroidNative) {
        await runAndroidForcedUpdate(latest);
      } else {
        await runDesktopForcedUpdate(latest);
      }
    } catch (error: any) {
      console.error('Forced update flow failed:', error);
      setStage('failed');
      setStatusMessage(error?.message || 'Update failed. Restart app and retry.');
      toast({
        title: 'Update Failed',
        description: error?.message || 'Unable to apply mandatory update.',
        variant: 'destructive',
        duration: 6000,
      });
    }
  };

  useEffect(() => {
    const checkVersion = async () => {
      try {
        // Add cache busting timestamp
        const res = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        const remote = await res.json();
        const current = localStorage.getItem('cb_version');
        
        console.log('Version check:', { current, remote: remote.version });
        
        if (current && current !== remote.version) {
          console.log('New version detected:', remote.version);
          setUpdateAvailable(true);
          
          // Show toast notification
          toast({
            title: "Update Available",
            description: `New version ${remote.version} is available. Updating...`,
            duration: 3000,
          });
          
          // Update stored version
          localStorage.setItem('cb_version', remote.version);
          
          // Clear all caches and reload
          if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(
              cacheNames.map(cacheName => caches.delete(cacheName))
            );
          }
          
          // Force service worker update
          if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration) {
              await registration.update();
              if (registration.waiting) {
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
              }
            }
          }
          
          // Add delay to show toast, then reload
          setTimeout(() => {
            window.location.reload();
          }, 2000);
          
        } else if (!current) {
          // First time - just store current version
          localStorage.setItem('cb_version', remote.version);
          console.log('Stored initial version:', remote.version);
        }
      } catch (error) {
        console.error('Error checking version:', error);
      }
    };

    // Check version on app start
    checkVersion();
    checkForcedAppUpdate();

    // Check version every 2 minutes for long-running sessions
    const interval = setInterval(checkVersion, 2 * 60 * 1000);
    
    // Check version when tab becomes visible (user returns to app)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkVersion();
        checkForcedAppUpdate();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Check version when app regains focus
    const handleFocus = () => {
      checkVersion();
      checkForcedAppUpdate();
    };
    
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [toast]);

  // Listen for service worker updates
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'FORCE_UPDATE') {
          console.log('Service worker requesting force update');
          toast({
            title: "App Updated",
            description: "Loading new version...",
            duration: 2000,
          });
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }

        if (event.data.type === 'ASSET_RECOVERY_REQUIRED') {
          console.warn('Service worker requested asset recovery reload for:', event.data.assetPath);
          toast({
            title: "Recovering app update",
            description: "Refreshing to load the latest assets...",
            duration: 2500,
          });
          setTimeout(() => {
            const nextUrl = new URL(window.location.href);
            nextUrl.searchParams.set('sw_recover', Date.now().toString());
            window.location.replace(nextUrl.toString());
          }, 250);
        }
      });

      // Check for waiting service worker
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration && registration.waiting) {
          console.log('Service worker waiting, triggering update');
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    }
  }, [toast]);

  const shouldBlockUi = useMemo(
    () => stage !== 'idle' && stage !== 'checking' && !!forcedUpdate,
    [stage, forcedUpdate]
  );

  return (
    <>
      {shouldBlockUi && (
        <div className="fixed inset-0 z-[9999] bg-background/98 backdrop-blur-sm">
          <div className="flex h-full w-full items-center justify-center p-6">
            <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl">
              <div className="mb-4 flex items-center gap-3">
                {isAndroidNative ? (
                  <Smartphone className="h-6 w-6 text-primary" />
                ) : (
                  <Download className="h-6 w-6 text-primary" />
                )}
                <h2 className="text-xl font-semibold">App update in progress</h2>
              </div>

              <p className="mb-4 text-sm text-muted-foreground">
                A newer secure version ({forcedUpdate?.version}) is available. This update cannot be skipped.
              </p>

              <div className="mb-4 flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
                {stage === 'verifying' ? (
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                )}
                <span className="text-sm font-medium">{statusMessage}</span>
              </div>

              {stage === 'failed' && (
                <p className="text-sm text-destructive">
                  Update failed. Restart app and keep internet enabled, then retry.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default VersionChecker;
