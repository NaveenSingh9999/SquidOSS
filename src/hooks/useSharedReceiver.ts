import { useEffect, useState } from 'react';
import SharedReceiver, { SharedFile } from '../capacitor-plugins/shared-receiver';
import { App as CapacitorApp } from '@capacitor/app';

export function useSharedReceiver() {
  const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([]);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    async function init() {
      try {
        const initial = await SharedReceiver.getInitialSharedFiles();
        if (initial && initial.files && initial.files.length) {
          setSharedFiles(initial.files);
          await SharedReceiver.clearSharedFiles().catch(() => {}); // prevent ghost loop
        }
      } catch (e) {
        // ignore
      }

      // Listen for incoming shared files emitted by native Android code via plugin
      await SharedReceiver.addListener('sharedFiles', async (event) => {
        const files = Array.isArray(event?.files) ? event.files : [];
        if (files.length === 0) return;
        setSharedFiles((prev) => [...files, ...prev]);
        await SharedReceiver.clearSharedFiles().catch(() => {});
      });

      // Fallback: some native intents may open the app with a URL; listen for url opens
      const handlerPromise = CapacitorApp.addListener('appUrlOpen', (data) => {
        try {
          const url = new URL(data.url);
          const shared = url.searchParams.get('sharedFiles');
          if (shared) {
            const parsed = JSON.parse(decodeURIComponent(shared));
            setSharedFiles((prev) => [...parsed, ...prev]);
          }
        } catch (_e) {
          // ignore
        }
      });

      unsub = async () => {
        try {
          const handler = await handlerPromise;
          await handler.remove();
        } catch (_e) {
          // ignore
        }
      };
    }

    init();

    return () => {
      if (unsub) unsub();
    };
  }, []);

  return { sharedFiles, setSharedFiles };
}
