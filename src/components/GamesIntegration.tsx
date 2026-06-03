import React, { useState, useEffect } from 'react';
import { Gamepad2, X, Play } from '@/lib/icon-map';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface GamesIntegrationProps {
  isUploading: boolean;
  uploadProgress?: number;
  isDecoding?: boolean;
  onOpenGames: () => void;
}

const GamesIntegration: React.FC<GamesIntegrationProps> = ({
  isUploading,
  uploadProgress = 0,
  isDecoding = false,
  onOpenGames
}) => {
  const [showGameButton, setShowGameButton] = useState(false);
  const [gameToastId, setGameToastId] = useState<string | number | null>(null);

  // Show game button when uploading or decoding
  useEffect(() => {
    if (isUploading || isDecoding) {
      setShowGameButton(true);
      
      // Show toast notification
      const toastId = toast.info(
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-purple-600 flex items-center justify-center">
                <Gamepad2 className="h-4 w-4 text-white" />
              </div>
              {(isUploading || isDecoding) && (
                <div className="absolute inset-0 rounded-full border-2 border-teal-500 animate-spin border-t-transparent" />
              )}
            </div>
            <div>
              <p className="font-medium text-sm">
                {isUploading ? 'Uploading files...' : 'Processing files...'}
              </p>
              <p className="text-xs text-gray-500">
                Play games while you wait!
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={onOpenGames}
            className="bg-gradient-to-r from-teal-500 to-purple-600 hover:from-teal-600 hover:to-purple-700 text-white ml-3"
          >
            <Play className="h-3 w-3 mr-1" />
            Play
          </Button>
        </div>,
        {
          duration: Infinity,
          action: {
            label: "Dismiss",
            onClick: () => setShowGameButton(false)
          }
        }
      );
      
      setGameToastId(toastId);
    } else {
      setShowGameButton(false);
      
      // Dismiss the toast when upload/decoding is complete
      if (gameToastId) {
        toast.dismiss(gameToastId);
        setGameToastId(null);
        
        // Show completion message
        toast.success('Files processed successfully!', {
          duration: 3000,
        });
      }
    }
  }, [isUploading, isDecoding, onOpenGames, gameToastId]);

  // Progress-based encouragement messages
  useEffect(() => {
    if (isUploading && uploadProgress > 0) {
      if (uploadProgress === 25) {
        toast('🎮 25% uploaded - Perfect time for a quick game!', { duration: 2000 });
      } else if (uploadProgress === 50) {
        toast('🎯 Halfway there - Keep playing!', { duration: 2000 });
      } else if (uploadProgress === 75) {
        toast('🚀 75% complete - Almost done!', { duration: 2000 });
      }
    }
  }, [uploadProgress, isUploading]);

  // Floating game button (alternative to toast)
  if (showGameButton) {
    return (
      <div className="fixed bottom-24 right-4 z-40 animate-in slide-in-from-bottom-4 duration-300">
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/50 p-4 max-w-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-purple-600 flex items-center justify-center">
                  <Gamepad2 className="h-4 w-4 text-white" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-teal-500 animate-spin border-t-transparent" />
              </div>
              <div>
                <p className="font-medium text-sm text-gray-900">
                  {isUploading ? 'Uploading...' : 'Processing...'}
                </p>
                <p className="text-xs text-gray-500">
                  Play while you wait
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowGameButton(false)}
              className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          
          {/* Progress bar */}
          {isUploading && (
            <div className="mb-3">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-teal-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">{uploadProgress}% complete</p>
            </div>
          )}
          
          <Button
            onClick={onOpenGames}
            className="w-full bg-gradient-to-r from-teal-500 to-purple-600 hover:from-teal-600 hover:to-purple-700 text-white"
            size="sm"
          >
            <Play className="h-4 w-4 mr-2" />
            Play Games
          </Button>
        </div>
      </div>
    );
  }

  return null;
};

// Hook for managing games integration state
export const useGamesIntegration = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDecoding, setIsDecoding] = useState(false);

  const startUpload = () => {
    setIsUploading(true);
    setUploadProgress(0);
  };

  const updateUploadProgress = (progress: number) => {
    setUploadProgress(Math.min(100, Math.max(0, progress)));
  };

  const finishUpload = () => {
    setIsUploading(false);
    setUploadProgress(100);
    setTimeout(() => setUploadProgress(0), 1000);
  };

  const startDecoding = () => {
    setIsDecoding(true);
  };

  const finishDecoding = () => {
    setIsDecoding(false);
  };

  return {
    isUploading,
    uploadProgress,
    isDecoding,
    startUpload,
    updateUploadProgress,
    finishUpload,
    startDecoding,
    finishDecoding
  };
};

// Custom toast for games
export const showGameToast = (onOpenGames: () => void) => {
  return toast.custom((t) => (
    <div className={cn(
      "bg-white rounded-lg shadow-lg border border-gray-200 p-4 max-w-md",
      "animate-in slide-in-from-top-2 duration-300"
    )}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-purple-600 flex items-center justify-center">
          <Gamepad2 className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-gray-900">Take a break!</p>
          <p className="text-sm text-gray-600">Play games while your files upload</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={onOpenGames}
            className="bg-gradient-to-r from-teal-500 to-purple-600 hover:from-teal-600 hover:to-purple-700 text-white"
          >
            <Play className="h-3 w-3 mr-1" />
            Play
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => toast.dismiss(t)}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  ), {
    duration: 10000,
  });
};

export default GamesIntegration;