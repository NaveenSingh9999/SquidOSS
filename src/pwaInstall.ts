
// Function to register service worker for PWA
export const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      // Check if we already have an active service worker for this scope
      const existingRegistration = await navigator.serviceWorker.getRegistration('/');
      if (existingRegistration && existingRegistration.active) {
        console.log('Service worker already active, skipping registration');
        return existingRegistration;
      }
      
      // Register the new service worker
      const registration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/',
        updateViaCache: 'none' // Always check for updates
      });
      
      console.log('Service worker registered successfully with scope:', registration.scope);
      
      // Force immediate activation
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      
      // Listen for service worker updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('New content available; please refresh to update');
              // Don't automatically reload - let the user decide
              // Show a toast or notification instead of forcing reload
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('SquidCloud Updated', {
                  body: 'New content is available. Please refresh to update.',
                  icon: '/favicon.ico'
                });
              }
            }
          });
        }
      });
      
      return registration;
    } catch (error) {
      console.error('Service worker registration failed:', error);
      return null;
    }
  }
  
  return null;
};

// Check if the app is installable
export const isPwaInstallable = async () => {
  // Return early if PWA installation isn't supported
  if (!window.matchMedia('(display-mode: browser)').matches) {
    return false; // Already installed
  }
  
  // Check if the app can be installed
  if ('BeforeInstallPromptEvent' in window) {
    return true;
  } else if (
    // iOS detection
    navigator.userAgent.match(/iPhone|iPad|iPod/) &&
    !navigator.userAgent.match(/CriOS/) &&
    !window.matchMedia('(display-mode: standalone)').matches
  ) {
    return true;
  } else if (
    // Android detection
    navigator.userAgent.match(/Android/) &&
    !window.matchMedia('(display-mode: standalone)').matches
  ) {
    return true;
  }
  
  return false;
};

// Class to handle PWA installation prompts
export class PwaInstallHandler {
  private deferredPrompt: any = null;

  constructor() {
    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent Chrome 76+ from automatically showing the prompt
      e.preventDefault();
      // Stash the event so it can be triggered later
      this.deferredPrompt = e;
    });
  }

  // Method to check if the app can be installed
  public canInstall(): boolean {
    return !!this.deferredPrompt;
  }

  // Method to show the install prompt
  public async install(): Promise<boolean> {
    if (!this.deferredPrompt) {
      // Handle iOS installation instructions
      if (
        navigator.userAgent.match(/iPhone|iPad|iPod/) && 
        !navigator.userAgent.match(/CriOS/)
      ) {
        alert('To install this app on iOS: tap the Share button and then "Add to Home Screen"');
        return false;
      }
      
      // For Android without prompt support
      if (navigator.userAgent.match(/Android/)) {
        alert('To install this app on Android, tap the menu button and then "Add to Home Screen"');
        return false;
      }
      
      return false;
    }

    // Show the install prompt
    this.deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const choiceResult = await this.deferredPrompt.userChoice;
    
    // Clear the deferredPrompt variable
    this.deferredPrompt = null;
    
    // Check if the user accepted the prompt
    return choiceResult.outcome === 'accepted';
  }
}
