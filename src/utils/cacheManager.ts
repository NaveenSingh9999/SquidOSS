/**
 * Cache management utilities for SquidCloud
 * Handles aggressive cache busting and update detection
 */

export class CacheManager {
  private static readonly VERSION_KEY = 'cb_version';
  private static readonly BUILD_TIMESTAMP_KEY = 'cb_build_timestamp';
  
  /**
   * Clear all application caches
   */
  static async clearAllCaches(): Promise<void> {
    try {
      // Clear service worker caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => {
            console.log('Clearing cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      }
      
      // Clear localStorage cache entries
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('cb_cache_') || key.includes('_cache'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // Clear sessionStorage
      sessionStorage.clear();
      
      console.log('All caches cleared successfully');
    } catch (error) {
      console.error('Error clearing caches:', error);
    }
  }
  
  /**
   * Force service worker update
   */
  static async forceServiceWorkerUpdate(): Promise<void> {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          // Force update check
          await registration.update();
          
          // If there's a waiting worker, activate it
          if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          
          // Listen for the new service worker to take control
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('New service worker took control');
          });
        }
      } catch (error) {
        console.error('Error updating service worker:', error);
      }
    }
  }
  
  /**
   * Check if app needs update based on build timestamp
   */
  static async checkForUpdates(): Promise<boolean> {
    try {
      // Get current build timestamp from server
      const response = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch version info');
      }
      
      const versionInfo = await response.json();
      const currentVersion = localStorage.getItem(this.VERSION_KEY);
      const currentTimestamp = localStorage.getItem(this.BUILD_TIMESTAMP_KEY);
      
      // Check if version or timestamp changed
      const versionChanged = currentVersion && currentVersion !== versionInfo.version;
      const timestampChanged = currentTimestamp && versionInfo.timestamp && 
                              currentTimestamp !== versionInfo.timestamp;
      
      if (versionChanged || timestampChanged) {
        // Store new version info
        localStorage.setItem(this.VERSION_KEY, versionInfo.version);
        if (versionInfo.timestamp) {
          localStorage.setItem(this.BUILD_TIMESTAMP_KEY, versionInfo.timestamp);
        }
        
        console.log('Update detected:', {
          oldVersion: currentVersion,
          newVersion: versionInfo.version,
          oldTimestamp: currentTimestamp,
          newTimestamp: versionInfo.timestamp
        });
        
        return true;
      }
      
      // Store initial values if not present
      if (!currentVersion) {
        localStorage.setItem(this.VERSION_KEY, versionInfo.version);
      }
      if (!currentTimestamp && versionInfo.timestamp) {
        localStorage.setItem(this.BUILD_TIMESTAMP_KEY, versionInfo.timestamp);
      }
      
      return false;
    } catch (error) {
      console.error('Error checking for updates:', error);
      return false;
    }
  }
  
  /**
   * Perform complete app refresh with cache clearing
   */
  static async performHardRefresh(): Promise<void> {
    try {
      // Clear all caches
      await this.clearAllCaches();
      
      // Force service worker update
      await this.forceServiceWorkerUpdate();
      
      // Add cache busting parameters to current URL
      const url = new URL(window.location.href);
      url.searchParams.set('v', Date.now().toString());
      url.searchParams.set('cache_bust', 'true');
      
      // Navigate to the cache-busted URL
      window.location.href = url.toString();
    } catch (error) {
      console.error('Error during hard refresh:', error);
      // Fallback to normal reload
      window.location.reload();
    }
  }
  
  /**
   * Add cache busting parameters to URLs
   */
  static addCacheBusting(url: string): string {
    const urlObj = new URL(url, window.location.origin);
    urlObj.searchParams.set('v', Date.now().toString());
    return urlObj.toString();
  }
  
  /**
   * Setup automatic update checking
   */
  static setupAutoUpdateCheck(intervalMinutes: number = 2): () => void {
    const checkAndUpdate = async () => {
      const needsUpdate = await this.checkForUpdates();
      if (needsUpdate) {
        console.log('Auto-update triggered');
        await this.performHardRefresh();
      }
    };
    
    // Initial check
    setTimeout(checkAndUpdate, 5000); // Wait 5 seconds after page load
    
    // Periodic checks
    const interval = setInterval(checkAndUpdate, intervalMinutes * 60 * 1000);
    
    // Check when tab becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkAndUpdate();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Return cleanup function
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }
}

export default CacheManager;