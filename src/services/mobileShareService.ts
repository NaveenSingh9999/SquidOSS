import { Share, CanShareResult, ShareOptions, ShareResult } from '@capacitor/share';
import { isNativePlatform } from '@/utils/mobile';

/**
 * Check if native share is available
 */
export const canShare = async (): Promise<boolean> => {
  if (!isNativePlatform()) {
    return false;
  }

  try {
    const result: CanShareResult = await Share.canShare();
    return result.value;
  } catch (error) {
    console.error('Failed to check share availability:', error);
    return false;
  }
};

/**
 * Share a link using native share dialog
 * @param url The URL to share
 * @param title The title of the share
 * @param text Additional text to share
 * @returns true if shared successfully, false otherwise
 */
export const shareLink = async (
  url: string,
  title?: string,
  text?: string
): Promise<boolean> => {
  if (!isNativePlatform()) {
    console.warn('Native share is only available on native platforms');
    return false;
  }

  try {
    const shareOptions: ShareOptions = {
      url,
      title: title || 'Share',
      text: text || url,
      dialogTitle: title || 'Share this link'
    };

    const result: ShareResult = await Share.share(shareOptions);
    
    // On some platforms, Share.share doesn't return activityType on success
    // We'll consider it successful if no error was thrown
    return true;
  } catch (error: any) {
    // User cancelled the share dialog
    if (error?.message?.includes('cancelled') || error?.message?.includes('canceled')) {
      console.log('User cancelled share');
      return false;
    }
    
    console.error('Failed to share link:', error);
    return false;
  }
};

/**
 * Share a file using native share dialog
 * @param fileUrl The URL or data URL of the file to share
 * @param title The title of the share
 * @param text Additional text to share
 * @returns true if shared successfully, false otherwise
 */
export const shareFile = async (
  fileUrl: string,
  title?: string,
  text?: string
): Promise<boolean> => {
  if (!isNativePlatform()) {
    console.warn('Native file sharing is only available on native platforms');
    return false;
  }

  try {
    const shareOptions: ShareOptions = {
      url: fileUrl,
      title: title || 'Share File',
      text: text || 'Check out this file',
      dialogTitle: title || 'Share this file'
    };

    const result: ShareResult = await Share.share(shareOptions);
    return true;
  } catch (error: any) {
    // User cancelled the share dialog
    if (error?.message?.includes('cancelled') || error?.message?.includes('canceled')) {
      console.log('User cancelled share');
      return false;
    }
    
    console.error('Failed to share file:', error);
    return false;
  }
};

/**
 * Share text using native share dialog
 * @param text The text to share
 * @param title The title of the share
 * @returns true if shared successfully, false otherwise
 */
export const shareText = async (
  text: string,
  title?: string
): Promise<boolean> => {
  if (!isNativePlatform()) {
    console.warn('Native share is only available on native platforms');
    return false;
  }

  try {
    const shareOptions: ShareOptions = {
      text,
      title: title || 'Share',
      dialogTitle: title || 'Share this text'
    };

    const result: ShareResult = await Share.share(shareOptions);
    return true;
  } catch (error: any) {
    // User cancelled the share dialog
    if (error?.message?.includes('cancelled') || error?.message?.includes('canceled')) {
      console.log('User cancelled share');
      return false;
    }
    
    console.error('Failed to share text:', error);
    return false;
  }
};
