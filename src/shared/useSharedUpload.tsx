import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { initSharedReceiver, registerUploadHandler } from './receive-share';
import { backgroundUploadService } from '@/services/backgroundUpload';
import { isNativePlatform } from '@/utils/mobile';

interface IncomingSharedFile {
  uri: string;
  name?: string;
  mimeType?: string;
}

const inferFileName = (uri: string, fallback = 'shared-file'): string => {
  try {
    const decoded = decodeURIComponent(uri);
    const candidate = decoded.split('/').pop();
    if (candidate && candidate.trim().length > 0) {
      return candidate;
    }
  } catch (_error) {
    // ignore and use fallback
  }

  return `${fallback}-${Date.now()}`;
};

const toWebViewUrl = (uri: string): string => {
  if (uri.startsWith('content://') || uri.startsWith('file://')) {
    return Capacitor.convertFileSrc(uri);
  }

  return uri;
};

const sharedUriToFile = async (shared: IncomingSharedFile): Promise<File> => {
  const sourceUrl = toWebViewUrl(shared.uri);
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Unable to read shared file (${response.status})`);
  }

  const blob = await response.blob();
  const type = shared.mimeType || blob.type || 'application/octet-stream';
  const name = shared.name || inferFileName(shared.uri);

  return new File([blob], name, {
    type,
    lastModified: Date.now(),
  });
};

// Example upload handler using fetch to upload to a server endpoint.
export function useSharedUpload() {
  useEffect(() => {
    if (!isNativePlatform()) {
      return;
    }

    const processed = new Set<string>();

    // register a simple upload handler
    registerUploadHandler(async (file: IncomingSharedFile) => {
      const dedupeKey = `${file.uri}|${file.name || ''}|${file.mimeType || ''}`;
      if (processed.has(dedupeKey)) {
        return;
      }
      processed.add(dedupeKey);

      try {
        const browserFile = await sharedUriToFile(file);
        await backgroundUploadService.addTask(browserFile, '');
      } catch (e) {
        console.error('shared upload failed', e);
        processed.delete(dedupeKey);
      }
    });

    // initialize listener
    initSharedReceiver();
  }, []);
}
