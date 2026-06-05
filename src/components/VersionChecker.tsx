import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

export const VersionChecker = () => {
  const { toast } = useToast();

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-cache',
          headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
        });
        const remote = await res.json();
        const current = localStorage.getItem('cb_version');

        if (current && current !== remote.version) {
          toast({
            title: "Update Available",
            description: `New version ${remote.version}`,
            duration: 3000,
          });
          localStorage.setItem('cb_version', remote.version);
          if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(cn => caches.delete(cn)));
          }
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) {
              await reg.update();
              if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          }
          setTimeout(() => window.location.reload(), 2000);
        } else if (!current) {
          localStorage.setItem('cb_version', remote.version);
        }
      } catch {}
    };

    checkVersion();
    const interval = setInterval(checkVersion, 2 * 60 * 1000);
    const handleVisibility = () => { if (!document.hidden) checkVersion() };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', checkVersion);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', checkVersion);
    };
  }, [toast]);

  return null;
};

export default VersionChecker;
