
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Download, 
  X,
  Info,
  Maximize2,
  Minimize2
} from '@/lib/icon-map';
import { formatBytes } from '@/lib/api';

interface ImageViewerProps {
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
}

const ImageViewer: React.FC<ImageViewerProps> = ({
  file,
  src,
  open,
  onClose,
  onDownload
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showMetadata, setShowMetadata] = useState(false);
  const [imageMetadata, setImageMetadata] = useState<{
    width?: number;
    height?: number;
  }>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      // Reset transformations when opening
      setZoom(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
      setShowMetadata(false);
      setImageMetadata({});
      setIsFullscreen(false);
    }
  }, [open, src]);

  const handleImageLoad = useCallback(() => {
    if (imageRef.current) {
      setImageMetadata({
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight
      });
    }
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev * 1.25, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev / 1.25, 0.1));
  }, []);

  const handleRotate = useCallback(() => {
    setRotation(prev => (prev + 90) % 360);
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom > 1) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  }, [zoom, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      e.preventDefault();
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  }, [isDragging, dragStart, zoom]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY;
    
    if (delta < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  }, [handleZoomIn, handleZoomOut]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!open) return;
    
    switch (e.code) {
      case 'Equal':
      case 'NumpadAdd':
        e.preventDefault();
        handleZoomIn();
        break;
      case 'Minus':
      case 'NumpadSubtract':
        e.preventDefault();
        handleZoomOut();
        break;
      case 'KeyR':
        e.preventDefault();
        handleRotate();
        break;
      case 'Escape':
        e.preventDefault();
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
        break;
      case 'KeyI':
        e.preventDefault();
        setShowMetadata(!showMetadata);
        break;
      case 'KeyF':
        e.preventDefault();
        setIsFullscreen(!isFullscreen);
        break;
      case 'Space':
        e.preventDefault();
        handleReset();
        break;
    }
  }, [open, handleZoomIn, handleZoomOut, handleRotate, isFullscreen, onClose, showMetadata, handleReset]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`${isFullscreen ? 'max-w-full w-screen h-screen p-0' : 'max-w-6xl w-[95vw] h-[90vh] p-0'}`}>
        {!isFullscreen && (
          <DialogHeader className="absolute top-0 left-0 right-0 z-10 bg-background/95 backdrop-blur-sm p-4 border-b">
            <DialogTitle className="flex items-center justify-between">
              <span className="truncate">{file.name}</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMetadata(!showMetadata)}
                >
                  <Info className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleFullscreen}
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
                {onDownload && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onDownload}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
        )}

        <div className={`relative ${isFullscreen ? 'h-screen' : 'h-full pt-16 pb-20'}`}>
          {/* Image Container */}
          <div 
            ref={containerRef}
            className={`relative w-full h-full overflow-hidden ${isFullscreen ? 'bg-black' : 'bg-black/5'} flex items-center justify-center ${
              isDragging ? 'cursor-grabbing' : zoom > 1 ? 'cursor-grab' : 'cursor-default'
            }`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            <img
              ref={imageRef}
              src={src}
              alt={file.name}
              className="max-w-full max-h-full object-contain select-none transition-transform duration-100 ease-out"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
                imageRendering: 'auto',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
              }}
              onLoad={handleImageLoad}
              draggable={false}
            />
          </div>

          {/* Metadata Panel */}
          {showMetadata && !isFullscreen && (
            <div className="absolute right-4 top-20 bg-background border rounded-lg shadow-lg p-4 w-64 z-20">
              <h4 className="font-semibold mb-2">Image Information</h4>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Name:</span>
                  <p className="text-muted-foreground truncate">{file.name}</p>
                </div>
                <div>
                  <span className="font-medium">Type:</span>
                  <p className="text-muted-foreground">{file.type}</p>
                </div>
                <div>
                  <span className="font-medium">Size:</span>
                  <p className="text-muted-foreground">{formatBytes(file.size)}</p>
                </div>
                {imageMetadata.width && imageMetadata.height && (
                  <div>
                    <span className="font-medium">Dimensions:</span>
                    <p className="text-muted-foreground">
                      {imageMetadata.width} × {imageMetadata.height}
                    </p>
                  </div>
                )}
                <div>
                  <span className="font-medium">Zoom:</span>
                  <p className="text-muted-foreground">{Math.round(zoom * 100)}%</p>
                </div>
              </div>
            </div>
          )}

          {/* Fullscreen Controls */}
          {isFullscreen && (
            <div className="absolute top-4 right-4 z-20 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={toggleFullscreen}
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Bottom Controls */}
        <div className={`absolute bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm p-4 border-t ${isFullscreen ? 'hidden' : ''}`}>
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomOut}
              disabled={zoom <= 0.1}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            
            <span className="text-sm font-medium min-w-16 text-center">
              {Math.round(zoom * 100)}%
            </span>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomIn}
              disabled={zoom >= 5}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleRotate}
            >
              <RotateCw className="h-4 w-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
            >
              Reset
            </Button>
          </div>
          
          <div className="text-center mt-2 text-xs text-muted-foreground">
            Mouse wheel to zoom • Drag to pan • R to rotate • I for info • F for fullscreen • Space to reset
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImageViewer;
