
import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { X } from '@/lib/icon-map';

interface JWPlayerProps {
  src: string;
  title: string;
  open: boolean;
  onClose: () => void;
  poster?: string;
}

const JWPlayer: React.FC<JWPlayerProps> = ({ src, title, open, onClose, poster }) => {
  const playerRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!open) return;
      
      switch (e.key) {
        case 'f':
        case 'F':
          e.preventDefault();
          handleFullscreen();
          break;
      }
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('keydown', handleKeyPress);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [open]);

  const handleFullscreen = () => {
    if (containerRef.current) {
      if (!isFullscreen) {
        containerRef.current.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    // Prevent default double-click behavior (fullscreen toggle)
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl w-[95vw] p-0 bg-black [&>button]:hidden">
        <div 
          ref={containerRef}
          className="relative w-full h-[80vh] flex items-center justify-center bg-black"
          onDoubleClick={handleDoubleClick}
        >
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/80 to-transparent p-4">
            <div className="flex items-center justify-between text-white">
              <h3 className="font-semibold text-lg truncate pr-4">{title}</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-white hover:bg-white/20 h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Video Player with native controls only */}
          <video
            ref={playerRef}
            src={src}
            poster={poster}
            className="max-w-full max-h-full object-contain"
            controls
            preload="metadata"
            onDoubleClick={handleDoubleClick}
          />

          {/* Mobile responsive hint */}
          <div className="absolute bottom-4 left-4 right-4 text-center text-white/60 text-xs md:hidden">
            Use 'F' key or native fullscreen controls for fullscreen
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default JWPlayer;
