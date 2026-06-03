import SharedReceiver, { onSharedFiles } from '../capacitor-plugins/shared-receiver';

export type UploadHandler = (file: { uri: string; name?: string; mimeType?: string }) => Promise<void>;

let _uploader: UploadHandler | null = null;
const runtimeProcessed = new Set<string>();

const fingerprintSharedFile = (file: { uri: string; name?: string; mimeType?: string }) =>
  `${file.uri}|${file.name || ''}|${file.mimeType || ''}`;

const processSharedFiles = async (files: Array<{ uri: string; name?: string; mimeType?: string }>) => {
  if (!_uploader || !files.length) return;

  const uniqueFiles = files.filter((file) => {
    const fingerprint = fingerprintSharedFile(file);
    if (runtimeProcessed.has(fingerprint)) return false;
    runtimeProcessed.add(fingerprint);
    return true;
  });

  if (!uniqueFiles.length) return;

  await Promise.allSettled(
    uniqueFiles.map((file) =>
      _uploader!({ uri: file.uri, name: file.name, mimeType: file.mimeType })
    )
  );
};

export function registerUploadHandler(fn: UploadHandler) {
  _uploader = fn;
}

export function initSharedReceiver() {
  // Handle initial shared files when app launched from intent
  SharedReceiver.getInitialSharedFiles()
    .then(async ({ files }) => {
      await processSharedFiles((files || []).map((f) => ({ uri: f.uri, name: f.name, mimeType: f.mimeType })));
      await SharedReceiver.clearSharedFiles().catch(() => {});
    })
    .catch(() => {});

  // Live listener
  onSharedFiles((files) => {
    processSharedFiles((files || []).map((f) => ({ uri: f.uri, name: f.name, mimeType: f.mimeType })))
      .then(() => SharedReceiver.clearSharedFiles().catch(() => {}))
      .catch((e) => {
        console.error('shared upload handler error', e);
      });
  });
}
