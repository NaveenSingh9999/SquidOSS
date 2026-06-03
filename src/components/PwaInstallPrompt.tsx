
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { PwaInstallHandler, registerServiceWorker } from '@/pwaInstall';
import { Download, X } from '@/lib/icon-map';
import { useIsMobile } from '@/hooks/use-mobile';

// Create a singleton instance of the handler
const pwaHandler = new PwaInstallHandler();

const PwaInstallPrompt: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstallable, setIsInstallable] = useState(false);
  const isMobile = useIsMobile();
  
  useEffect(() => {
    // Check if the app can be installed
    const checkInstallable = async () => {
      // Check if the app is already installed
      if (!window.matchMedia('(display-mode: browser)').matches) {
        return; // Already installed
      }
      
      // Check if the browser supports installation
      const canInstall = pwaHandler.canInstall();
      
      setIsInstallable(canInstall);
      
      // Show the prompt after a delay if installable
      if (canInstall) {
        const hasPromptBeenShown = localStorage.getItem('pwaPromptShown');
        
        if (!hasPromptBeenShown) {
          setTimeout(() => {
            setShowPrompt(true);
            localStorage.setItem('pwaPromptShown', 'true');
          }, 30000); // Show after 30 seconds
        }
      }
    };
    
    checkInstallable();
    
    // Recheck when the display mode changes
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const listener = () => checkInstallable();
    
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', listener);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(listener);
    }
    
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', listener);
      } else {
        // Fallback for older browsers
        mediaQuery.removeListener(listener);
      }
    };
  }, []);
  
  const handleInstall = () => {
    pwaHandler.install().then(installed => {
      if (installed) {
        setShowPrompt(false);
      }
    });
  };
  
  // Don't render anything if not installable or if prompt shouldn't be shown
  if (!isInstallable || !showPrompt) {
    return null;
  }
  
  // Mobile banner
  if (isMobile) {
    return (
      <div className="fixed bottom-16 left-0 right-0 bg-background border-t shadow-lg p-4 z-50 animate-slide-up">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded-full mr-3">
              <Download className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <h4 className="font-medium">Install SquidCloud</h4>
              <p className="text-sm text-muted-foreground">Add to your home screen</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowPrompt(false)}
            >
              <X className="h-4 w-4" />
            </Button>
            <Button 
              onClick={handleInstall} 
              className="bg-blue-500 text-white"
              size="sm"
            >
              Install
            </Button>
          </div>
        </div>
      </div>
    );
  }
  
  // Desktop notification
  return (
    <div className="fixed bottom-4 right-4 w-80 bg-background rounded-lg shadow-lg border p-4 z-50 animate-fade-in">
      <div className="flex justify-between items-start mb-3">
        <h4 className="font-medium">Install SquidCloud App</h4>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-6 w-6 p-0" 
          onClick={() => setShowPrompt(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Install our app for easier access and a better experience.
      </p>
      <Button 
        onClick={handleInstall} 
        className="w-full bg-gradient-to-r from-blue-500 to-blue-600"
      >
        <Download className="h-4 w-4 mr-2" />
        Install App
      </Button>
    </div>
  );
};

export default PwaInstallPrompt;
