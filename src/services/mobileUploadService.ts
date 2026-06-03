import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { isNativePlatform } from '@/utils/mobile';

export interface PhotoResult {
  blob: Blob;
  name: string;
  type: string;
}

/**
 * Request camera permissions
 */
export const requestCameraPermissions = async (): Promise<boolean> => {
  if (!isNativePlatform()) {
    return true; // Web has its own permission flow
  }

  try {
    const permissions = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
    return permissions.camera === 'granted' || permissions.photos === 'granted';
  } catch (error) {
    console.error('Failed to request camera permissions:', error);
    return false;
  }
};

/**
 * Convert base64 data URL to Blob
 */
const dataURLtoBlob = (dataURL: string): Blob => {
  const parts = dataURL.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  
  return new Blob([u8arr], { type: mime });
};

/**
 * Convert Photo to PhotoResult
 */
const photoToResult = (photo: Photo, index: number = 0): PhotoResult => {
  const blob = photo.dataUrl ? dataURLtoBlob(photo.dataUrl) : new Blob();
  const format = photo.format || 'jpeg';
  const timestamp = Date.now();
  const name = `photo_${timestamp}_${index}.${format}`;
  const type = `image/${format}`;
  
  return { blob, name, type };
};

/**
 * Take a photo using the camera
 */
export const takePhoto = async (): Promise<PhotoResult | null> => {
  if (!isNativePlatform()) {
    console.warn('Camera functionality is only available on native platforms');
    return null;
  }

  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
    });

    return photoToResult(photo);
  } catch (error) {
    console.error('Failed to take photo:', error);
    return null;
  }
};

/**
 * Pick photos from gallery
 */
export const pickFromGallery = async (multiple: boolean = true): Promise<PhotoResult[]> => {
  if (!isNativePlatform()) {
    console.warn('Gallery functionality is only available on native platforms');
    return [];
  }

  try {
    // Note: Capacitor Camera plugin doesn't support multiple selection natively
    // For multiple photos, we'd need a different plugin like @capacitor-community/media
    // For now, we'll return a single photo
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Photos,
    });

    return [photoToResult(photo)];
  } catch (error) {
    console.error('Failed to pick from gallery:', error);
    return [];
  }
};

/**
 * Check if camera is available
 */
export const isCameraAvailable = (): boolean => {
  return isNativePlatform();
};

/**
 * Check if gallery is available
 */
export const isGalleryAvailable = (): boolean => {
  return isNativePlatform();
};
