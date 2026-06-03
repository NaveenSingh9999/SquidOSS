import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/**
 * Check if the app is running on a native platform
 */
export const isNativePlatform = (): boolean => {
  return Capacitor.isNativePlatform();
};

/**
 * Get the current platform
 */
export const getPlatform = (): string => {
  return Capacitor.getPlatform();
};

/**
 * Initialize mobile app features (splash screen, status bar, etc.)
 */
export const initMobileApp = async (): Promise<void> => {
  if (!isNativePlatform()) {
    return;
  }

  try {
    // Hide splash screen after initialization
    await SplashScreen.hide();

    // Native status bar defaults for true fullscreen content on Android
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setStyle({ style: Style.Dark });
    } else if (Capacitor.getPlatform() !== 'web') {
      await StatusBar.setStyle({ style: Style.Dark });
    }
  } catch (error) {
    console.error('Error initializing mobile app:', error);
  }
};

/**
 * Haptic feedback utilities
 */
export const haptics = {
  /**
   * Light haptic feedback (e.g., for button taps)
   */
  light: async (): Promise<void> => {
    if (!isNativePlatform()) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (error) {
      console.error('Haptic feedback error:', error);
    }
  },

  /**
   * Medium haptic feedback (e.g., for selections)
   */
  medium: async (): Promise<void> => {
    if (!isNativePlatform()) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (error) {
      console.error('Haptic feedback error:', error);
    }
  },

  /**
   * Heavy haptic feedback (e.g., for errors or important actions)
   */
  heavy: async (): Promise<void> => {
    if (!isNativePlatform()) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch (error) {
      console.error('Haptic feedback error:', error);
    }
  },

  /**
   * Vibrate for a specific duration
   */
  vibrate: async (duration: number = 300): Promise<void> => {
    if (!isNativePlatform()) return;
    try {
      await Haptics.vibrate({ duration });
    } catch (error) {
      console.error('Haptic feedback error:', error);
    }
  },

  /**
   * Selection changed haptic feedback
   */
  selection: async (): Promise<void> => {
    if (!isNativePlatform()) return;
    try {
      await Haptics.selectionChanged();
    } catch (error) {
      console.error('Haptic feedback error:', error);
    }
  }
};

/**
 * Status bar utilities
 */
export const statusBar = {
  /**
   * Set status bar style
   */
  setStyle: async (style: 'light' | 'dark'): Promise<void> => {
    if (!isNativePlatform()) return;
    try {
      await StatusBar.setStyle({ 
        style: style === 'light' ? Style.Light : Style.Dark 
      });
    } catch (error) {
      console.error('Status bar error:', error);
    }
  },

  /**
   * Set status bar background color
   */
  setBackgroundColor: async (color: string): Promise<void> => {
    if (!isNativePlatform() || Capacitor.getPlatform() === 'ios') return;
    try {
      await StatusBar.setBackgroundColor({ color });
    } catch (error) {
      console.error('Status bar error:', error);
    }
  },

  /**
   * Show status bar
   */
  show: async (): Promise<void> => {
    if (!isNativePlatform()) return;
    try {
      await StatusBar.show();
    } catch (error) {
      console.error('Status bar error:', error);
    }
  },

  /**
   * Hide status bar
   */
  hide: async (): Promise<void> => {
    if (!isNativePlatform()) return;
    try {
      await StatusBar.hide();
    } catch (error) {
      console.error('Status bar error:', error);
    }
  }
};

/**
 * Splash screen utilities
 */
export const splashScreen = {
  /**
   * Show splash screen
   */
  show: async (): Promise<void> => {
    if (!isNativePlatform()) return;
    try {
      await SplashScreen.show({
        autoHide: false,
        showDuration: 2000
      });
    } catch (error) {
      console.error('Splash screen error:', error);
    }
  },

  /**
   * Hide splash screen
   */
  hide: async (): Promise<void> => {
    if (!isNativePlatform()) return;
    try {
      await SplashScreen.hide();
    } catch (error) {
      console.error('Splash screen error:', error);
    }
  }
};
