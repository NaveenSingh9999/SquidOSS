import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Helper utility to download and/or share a file Blob reliably across 
 * Web, Android, and iOS using Capacitor when available.
 */
export const downloadAndSaveBlob = async (blob: Blob, filename: string): Promise<void> => {
  if (Capacitor.isNativePlatform()) {
    try {
      // Convert Blob to base64
      const reader = new FileReader();
      const base64Data = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          // Extract just the base64 part
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      if (Capacitor.getPlatform() === 'android') {
        const { default: NativeDownloader } = await import('@/capacitor-plugins/native-downloader');
        await NativeDownloader.enqueueDownload({
          base64Data,
          filename,
          mimeType: blob.type || 'application/octet-stream',
        });
        return;
      }

      // Write file to device's Cache directory
      const savedFile = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Cache,
      });

      // In Capacitor native, we generally drop it into share so the user can save it fully or send it
      if (Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios') {
        const canShare = await Share.canShare();
        if (canShare.value) {
          await Share.share({
            title: `Download: ${filename}`,
            text: `Here is your downloaded file: ${filename}`,
            url: savedFile.uri,
            dialogTitle: `Save or Share ${filename}`,
          });
        }
      } else {
        // Fallback info toast if share fails
        console.log("File saved inside app cache at: ", savedFile.uri);
      }
    } catch (err) {
      console.error("Native file download failed:", err);
      throw err;
    }
  } else {
    // Normal Web Browser Download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
};
