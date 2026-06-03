
/**
 * Checks if the app is running in a Capacitor native container
 * @returns boolean
 */
export const isCapacitorApp = (): boolean => {
  return typeof (window as any)?.Capacitor !== 'undefined';
};

/**
 * Gets the platform the app is running on
 * @returns 'android' | 'ios' | 'web'
 */
export const getPlatform = (): 'android' | 'ios' | 'web' => {
  if (!isCapacitorApp()) {
    return 'web';
  }
  
  if ((window as any).Capacitor.platform === 'android') {
    return 'android';
  } else if ((window as any).Capacitor.platform === 'ios') {
    return 'ios';
  }
  
  return 'web';
};

/**
 * Checks if the app needs to display platform-specific UI
 * @param platform The platform to check for
 * @returns boolean
 */
export const isPlatform = (platform: 'android' | 'ios' | 'web' | 'mobile' | 'native'): boolean => {
  const currentPlatform = getPlatform();
  
  if (platform === 'mobile') {
    return currentPlatform === 'android' || currentPlatform === 'ios';
  }
  
  if (platform === 'native') {
    return currentPlatform !== 'web';
  }
  
  return currentPlatform === platform;
};
