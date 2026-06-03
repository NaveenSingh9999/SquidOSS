/**
 * Service Worker registration and update handling
 * Ensures users get the latest version without manual cache clearing
 */

export class ServiceWorkerManager {
  private static instance: ServiceWorkerManager;
  private registration: ServiceWorkerRegistration | null = null;
  private updateAvailable = false;

  private constructor() {}

  static getInstance(): ServiceWorkerManager {
    if (!ServiceWorkerManager.instance) {
      ServiceWorkerManager.instance = new ServiceWorkerManager();
    }
    return ServiceWorkerManager.instance;
  }

  async init(): Promise<void> {
    if ('serviceWorker' in navigator) {
      try {
        // Register service worker
        this.registration = await navigator.serviceWorker.register('/service-worker.js', {
          scope: '/',
          updateViaCache: 'none' // Always check for updates
        });

        console.log('Service Worker registered successfully');

        // Listen for updates
        this.registration.addEventListener('updatefound', () => {
          const newWorker = this.registration?.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('New service worker installed, update available');
                this.updateAvailable = true;
                this.notifyUpdateAvailable();
              }
            });
          }
        });

        // Listen for messages from service worker
        navigator.serviceWorker.addEventListener('message', (event) => {
          console.log('Message from service worker:', event.data);
          
          if (event.data.type === 'FORCE_UPDATE') {
            this.performUpdate();
          }
        });

        // Check for updates periodically
        setInterval(() => {
          this.checkForUpdates();
        }, 30000); // Check every 30 seconds

        // Check for updates when page becomes visible
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) {
            this.checkForUpdates();
          }
        });

      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  }

  async checkForUpdates(): Promise<void> {
    if (this.registration) {
      try {
        await this.registration.update();
      } catch (error) {
        console.error('Error checking for updates:', error);
      }
    }
  }

  private notifyUpdateAvailable(): void {
    // Show update notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('SquidCloud Update Available', {
        body: 'A new version is available and will be applied automatically.',
        icon: '/favicon.ico'
      });
    }

    // Trigger update after a short delay
    setTimeout(() => {
      this.performUpdate();
    }, 3000);
  }

  private async performUpdate(): Promise<void> {
    if (this.registration?.waiting) {
      // Tell the waiting service worker to activate
      this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      
      // Listen for the new service worker to take control
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('New service worker activated, reloading page');
        window.location.reload();
      });
    }
  }

  async clearAllCaches(): Promise<void> {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => {
          console.log('Clearing cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }
  }

  async forceUpdate(): Promise<void> {
    console.log('Forcing application update...');
    
    // Clear all caches
    await this.clearAllCaches();
    
    // Update service worker
    await this.checkForUpdates();
    
    // Perform hard reload
    const url = new URL(window.location.href);
    url.searchParams.set('cache_bust', Date.now().toString());
    window.location.href = url.toString();
  }
}

// Initialize service worker when module loads
if (typeof window !== 'undefined') {
  const swManager = ServiceWorkerManager.getInstance();
  
  // Initialize after page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      swManager.init();
    });
  } else {
    swManager.init();
  }
}

export default ServiceWorkerManager;