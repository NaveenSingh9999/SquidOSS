
import React, { useRef, useEffect } from 'react';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { X, Download, Share2 } from '@/lib/icon-map';

interface VideoPlayerProps {
  file: {
    id: string;
    name: string;
    type: string;
    size: number;
  };
  src: string;
  open: boolean;
  onClose: () => void;
  onDownload?: () => void;
  onShare?: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  file,
  src,
  open,
  onClose,
  onDownload,
  onShare
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (open && videoRef.current) {
      videoRef.current.load();
    }
  }, [open, src]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl w-[95vw] p-0 bg-black [&>button]:hidden">
        <div className="relative w-full h-[80vh] flex items-center justify-center bg-black">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/80 to-transparent p-4">
            <div className="flex items-center justify-between text-white">
              <h3 className="font-semibold text-lg truncate pr-4">{file.name}</h3>
              <div className="flex items-center gap-2">
                {onShare && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onShare}
                    className="text-white hover:bg-white/20 h-8 w-8 p-0"
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                )}
                {onDownload && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDownload}
                    className="text-white hover:bg-white/20 h-8 w-8 p-0"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                )}
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
          </div>

          {/* Video Player */}
          <video
            ref={videoRef}
            className="max-w-full max-h-full object-contain"
            controls
            preload="metadata"
            style={{ outline: 'none' }}
          >
            <source src={src} type={file.type} />
            Your browser does not support the video tag.
          </video>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VideoPlayer;
