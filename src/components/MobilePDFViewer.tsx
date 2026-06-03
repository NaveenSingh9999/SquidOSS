import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight,
  Download, Share2, X, RotateCw, Minus, Plus, Maximize2, Minimize2
} from '@/lib/icon-map';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import pdfjsLib from '@/lib/pdfjs-config';

interface MobilePDFViewerProps {
  file: {
    id: string;
    name: string;
    size: number;
  };
  pdfBlob: Blob | null;
  onClose?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
}

const MobilePDFViewer: React.FC<MobilePDFViewerProps> = ({
  file,
  pdfBlob,
  onClose,
  onDownload,
  onShare
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  
  // PDF State
  const [pdf, setPdf] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // View state
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Gesture tracking refs (not state to avoid re-renders during gestures)
  const gestureRef = useRef({
    isDragging: false,
    isPinching: false,
    lastTouchDistance: 0,
    lastTouchCenter: { x: 0, y: 0 },
    dragStart: { x: 0, y: 0 },
    swipeStart: { x: 0, y: 0, time: 0 },
    lastTap: 0,
    panStart: { x: 0, y: 0 }
  });
  
  // UI State
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Render quality settings
  const BASE_RENDER_SCALE = 2.4;
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 4;
  const SPRING_EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]';

  // Calculate touch distance
  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Calculate touch center
  const getTouchCenter = (touches: React.TouchList) => {
    if (touches.length < 2) return { x: 0, y: 0 };
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  };

  // Load PDF document from blob directly
  useEffect(() => {
    if (!pdfBlob) {
      setError('No PDF data provided');
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadPDF = async () => {
      try {
        setLoading(true);
        setError(null);
        
        if (pdfBlob.size === 0) {
          throw new Error('PDF file is empty');
        }
        
        // Convert blob to ArrayBuffer directly - no fetch needed
        const arrayBuffer = await pdfBlob.arrayBuffer();
        
        // Check PDF magic bytes
        const header = new Uint8Array(arrayBuffer.slice(0, 5));
        const headerStr = String.fromCharCode(...header);
        
        if (!headerStr.startsWith('%PDF')) {
          throw new Error('File is not a valid PDF (header: ' + headerStr + ')');
        }

        // Pass ArrayBuffer data directly - disable worker to avoid cross-origin issues
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(arrayBuffer),
          useWorkerFetch: false,
          isEvalSupported: false,
          useSystemFonts: true,
        });

        const pdfDoc = await loadingTask.promise;
        if (cancelled) return;
        setPdf(pdfDoc);
        setTotalPages(pdfDoc.numPages);
        setLoading(false);
      } catch (err: any) {
        console.error('MobilePDFViewer: Error loading PDF:', err);
        if (!cancelled) {
          const errorMessage = err.message || 'Unknown error loading PDF';
          setError(errorMessage);
          setLoading(false);
        }
      }
    };

    loadPDF();
    return () => { cancelled = true; };
  }, [pdfBlob]);

  // Render current page to canvas
  const renderCurrentPage = useCallback(async () => {
    if (!pdf || !canvasRef.current || !containerRef.current) return;

    // Cancel any pending render
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch (e) {}
    }

    setRendering(true);

    try {
      const page = await pdf.getPage(currentPage);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { alpha: false });
      
      if (!ctx) return;

      // Calculate viewport
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      
      const baseViewport = page.getViewport({ scale: 1, rotation });
      
      // Calculate scale to fit width
      const fitWidthScale = (containerWidth - 32) / baseViewport.width;
      const fitHeightScale = (containerHeight - 32) / baseViewport.height;
      const fitScale = Math.min(fitWidthScale, fitHeightScale);

      // Render at high resolution for current zoom level
      const qualityScale = scale > 2 ? 2 : BASE_RENDER_SCALE;
      const renderScale = fitScale * scale * qualityScale;
      const viewport = page.getViewport({ scale: renderScale, rotation });
      
      // Set canvas size
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      // Set display size
      const displayWidth = viewport.width / qualityScale;
      const displayHeight = viewport.height / qualityScale;
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      // Clear and fill white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, viewport.width, viewport.height);

      // Enable high quality rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Render PDF page
      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
        intent: 'display',
      });

      renderTaskRef.current = renderTask;
      await renderTask.promise;
      
      setRendering(false);
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('Error rendering page:', err);
      }
      setRendering(false);
    }
  }, [pdf, currentPage, scale, rotation]);

  // Render when page, scale, or rotation changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      renderCurrentPage();
    }, 50); // Small debounce to prevent rapid re-renders during gesture
    
    return () => clearTimeout(timeoutId);
  }, [renderCurrentPage]);

  // Reset transform when page changes
  useEffect(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, [currentPage]);

  // Auto-hide controls
  useEffect(() => {
    if (showControls) {
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
      hideControlsTimeout.current = setTimeout(() => {
        setShowControls(false);
      }, 4000);
    }

    return () => {
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
    };
  }, [showControls]);

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touches = e.touches;
    const g = gestureRef.current;

    if (touches.length === 2) {
      // Pinch start
      g.isPinching = true;
      g.isDragging = false;
      g.lastTouchDistance = getTouchDistance(touches);
      g.lastTouchCenter = getTouchCenter(touches);
      g.panStart = { ...pan };
    } else if (touches.length === 1) {
      // Pan or swipe start
      const touch = touches[0];
      g.isDragging = true;
      g.dragStart = { x: touch.clientX, y: touch.clientY };
      g.panStart = { ...pan };
      g.swipeStart = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      };
    }
  }, [pan]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touches = e.touches;
    const g = gestureRef.current;

    if (g.isPinching && touches.length === 2) {
      e.preventDefault();
      
      // Pinch zoom
      const newDistance = getTouchDistance(touches);
      const delta = newDistance / g.lastTouchDistance;
      
      setScale(prev => {
        const newScale = Math.min(Math.max(prev * delta, MIN_ZOOM), MAX_ZOOM);
        return newScale;
      });
      
      g.lastTouchDistance = newDistance;

      // Pan while pinching
      const newCenter = getTouchCenter(touches);
      const dx = newCenter.x - g.lastTouchCenter.x;
      const dy = newCenter.y - g.lastTouchCenter.y;
      
      setPan(prev => ({
        x: prev.x + dx,
        y: prev.y + dy
      }));
      
      g.lastTouchCenter = newCenter;
    } else if (g.isDragging && touches.length === 1 && scale > 1) {
      // Pan when zoomed
      const touch = touches[0];
      const dx = touch.clientX - g.dragStart.x;
      const dy = touch.clientY - g.dragStart.y;
      
      setPan({
        x: g.panStart.x + dx,
        y: g.panStart.y + dy
      });
    }
  }, [scale]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const now = Date.now();
    const g = gestureRef.current;
    
    if (g.isPinching) {
      g.isPinching = false;
      // Snap to 1x if close
      if (scale < 1.15 && scale > 0.85) {
        setScale(1);
        setPan({ x: 0, y: 0 });
      }
      return;
    }

    if (g.isDragging && e.changedTouches.length === 1) {
      const touch = e.changedTouches[0];
      const dx = touch.clientX - g.swipeStart.x;
      const dy = touch.clientY - g.swipeStart.y;
      const dt = now - g.swipeStart.time;

      // Check for swipe when not zoomed
      if (scale <= 1) {
        const velocityX = Math.abs(dx / dt);
        const isHorizontalSwipe = Math.abs(dx) > Math.abs(dy) * 1.5;

        if (isHorizontalSwipe && velocityX > 0.25 && Math.abs(dx) > 40) {
          if (dx > 0 && currentPage > 1) {
            setCurrentPage(prev => prev - 1);
          } else if (dx < 0 && currentPage < totalPages) {
            setCurrentPage(prev => prev + 1);
          }
        }
      }

      // Double tap detection
      const DOUBLE_TAP_DELAY = 300;
      const touchX = touch.clientX;
      const touchY = touch.clientY;
      
      if (now - g.lastTap < DOUBLE_TAP_DELAY) {
        if (scale > 1) {
          // Reset zoom
          setScale(1);
          setPan({ x: 0, y: 0 });
        } else {
          // Zoom to 2x at tap location
          setScale(2);
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            const x = touchX - rect.left - rect.width / 2;
            const y = touchY - rect.top - rect.height / 2;
            setPan({ x: -x, y: -y });
          }
        }
      }
      g.lastTap = now;
    }

    g.isDragging = false;
  }, [scale, currentPage, totalPages]);

  // Container tap handler for showing controls
  const handleContainerClick = useCallback(() => {
    setShowControls(prev => !prev);
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch (err) {
      console.error('MobilePDFViewer: Failed to toggle fullscreen', err);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Navigation
  const goToPage = (page: number) => {
    const target = Math.max(1, Math.min(totalPages, page));
    setCurrentPage(target);
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev * 1.5, MAX_ZOOM));
  };

  const handleZoomOut = () => {
    setScale(prev => {
      const newScale = prev / 1.5;
      if (newScale <= 1) {
        setPan({ x: 0, y: 0 });
        return 1;
      }
      return Math.max(newScale, MIN_ZOOM);
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-gradient-to-b from-background via-background to-muted/30">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-2 border-white/20 rounded-full" />
          <div className="absolute inset-0 border-2 border-transparent border-t-white rounded-full animate-spin" />
        </div>
        <p className="text-white/60 text-sm mt-4 font-medium">Loading PDF...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-gradient-to-b from-background via-background to-muted/30 px-8 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <X className="w-8 h-8 text-red-400" />
        </div>
        <p className="text-white font-medium mb-2">Unable to load PDF</p>
        <p className="text-white/50 text-sm mb-6">{error}</p>
        <Button 
          variant="outline" 
          onClick={onClose}
          className="border-white/20 text-white hover:bg-white/10 rounded-full px-6"
        >
          Close
        </Button>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="relative flex flex-col h-full w-full overflow-hidden select-none touch-none bg-gradient-to-b from-background via-background to-muted/20"
    >
      {/* Header */}
      <header className={cn(
        `absolute top-0 left-0 right-0 z-30 transition-all duration-300 ${SPRING_EASE}`,
        "pt-[env(safe-area-inset-top)]",
        showControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"
      )}>
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-b from-background/95 via-background/80 to-transparent backdrop-blur-xl border-b border-border/20">
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); onClose?.(); }}
            className={cn(
              `h-11 w-11 rounded-full bg-card/70 hover:bg-card active:scale-95 transition-all ${SPRING_EASE}`,
              "text-foreground backdrop-blur-sm border border-border/40"
            )}
          >
            <X className="w-5 h-5" />
          </Button>

          {/* Title */}
          <div className="flex-1 text-center px-4 min-w-0">
            <p className="text-foreground text-sm font-medium truncate">{file.name}</p>
            <p className="text-muted-foreground text-xs mt-0.5">
              Page {currentPage} of {totalPages}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); handleRotate(); }}
              className={cn(
                `h-11 w-11 rounded-full bg-card/70 hover:bg-card active:scale-95 transition-all ${SPRING_EASE}`,
                "text-foreground backdrop-blur-sm border border-border/40"
              )}
            >
              <RotateCw className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); handleToggleFullscreen(); }}
              className={cn(
                `h-11 w-11 rounded-full bg-card/70 hover:bg-card active:scale-95 transition-all ${SPRING_EASE}`,
                "text-foreground backdrop-blur-sm border border-border/40"
              )}
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </header>

      {/* PDF Canvas */}
      <div 
        className="flex-1 flex items-center justify-center overflow-hidden overscroll-contain"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleContainerClick}
      >
        <div 
          className={cn(`relative transition-transform duration-150 ${SPRING_EASE}`, "will-change-transform")}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
          }}
        >
          <canvas
            ref={canvasRef}
            className={cn(
              "block shadow-2xl rounded-sm bg-white",
              rendering && "opacity-90"
            )}
          />
          
          {/* Rendering indicator */}
          {rendering && (
            <div className="absolute top-4 right-4 bg-black/60 rounded-full px-3 py-1.5 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                <span className="text-white/80 text-xs font-medium">Rendering</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Zoom indicator when zoomed */}
      {scale !== 1 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20">
          <div className={cn(
            "bg-black/70 rounded-2xl px-4 py-2 backdrop-blur-sm transition-opacity duration-300",
            gestureRef.current.isPinching ? "opacity-100" : "opacity-0"
          )}>
            <span className="text-white text-lg font-semibold tabular-nums">
              {Math.round(scale * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* Footer Controls */}
      <footer className={cn(
        `absolute bottom-0 left-0 right-0 z-30 transition-all duration-300 ${SPRING_EASE}`,
        "pb-[env(safe-area-inset-bottom)]",
        showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      )}>
        <div className="px-4 py-4 bg-gradient-to-t from-background/95 via-background/80 to-transparent backdrop-blur-xl border-t border-border/20">
          {/* Zoom controls */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); handleZoomOut(); }}
              disabled={scale <= MIN_ZOOM}
              className={cn(
                `h-10 w-10 rounded-full bg-card/70 hover:bg-card active:scale-95 transition-all ${SPRING_EASE}`,
                "text-foreground disabled:opacity-30 backdrop-blur-sm border border-border/40"
              )}
            >
              <Minus className="w-4 h-4" />
            </Button>
            
            <div className="bg-card/70 backdrop-blur-sm rounded-full px-4 py-2 min-w-[80px] text-center border border-border/40">
              <span className="text-foreground text-sm font-medium tabular-nums">
                {Math.round(scale * 100)}%
              </span>
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); handleZoomIn(); }}
              disabled={scale >= MAX_ZOOM}
              className={cn(
                `h-10 w-10 rounded-full bg-card/70 hover:bg-card active:scale-95 transition-all ${SPRING_EASE}`,
                "text-foreground disabled:opacity-30 backdrop-blur-sm border border-border/40"
              )}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* Page navigation */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); goToPage(currentPage - 1); }}
              disabled={currentPage <= 1}
              className={cn(
                `h-12 w-12 rounded-full bg-card/70 hover:bg-card active:scale-95 transition-all ${SPRING_EASE}`,
                "text-foreground disabled:opacity-30 backdrop-blur-sm border border-border/40"
              )}
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>

            {/* Page indicator */}
            {totalPages <= 8 ? (
              <div className="flex items-center gap-2">
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={(e) => { e.stopPropagation(); goToPage(i + 1); }}
                    className={cn(
                      "transition-all duration-200 rounded-full",
                      currentPage === i + 1 
                        ? "w-8 h-2 bg-foreground" 
                        : "w-2 h-2 bg-foreground/40 hover:bg-foreground/60 active:scale-90"
                    )}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-card/70 backdrop-blur-sm rounded-full px-5 py-2 border border-border/40">
                <span className="text-foreground text-sm font-medium tabular-nums">
                  {currentPage} <span className="text-muted-foreground">of</span> {totalPages}
                </span>
              </div>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); goToPage(currentPage + 1); }}
              disabled={currentPage >= totalPages}
              className={cn(
                `h-12 w-12 rounded-full bg-card/70 hover:bg-card active:scale-95 transition-all ${SPRING_EASE}`,
                "text-foreground disabled:opacity-30 backdrop-blur-sm border border-border/40"
              )}
            >
              <ChevronRight className="w-6 h-6" />
            </Button>
          </div>

          {/* Bottom actions */}
          <div className="flex items-center justify-center gap-4 mt-4">
            {onDownload && (
              <Button
                variant="ghost"
                onClick={(e) => { e.stopPropagation(); onDownload(); }}
                className={cn(
                  `h-11 rounded-full bg-card/70 hover:bg-card active:scale-95 transition-all ${SPRING_EASE}`,
                  "text-foreground px-5 gap-2 backdrop-blur-sm border border-border/40"
                )}
              >
                <Download className="w-4 h-4" />
                <span className="text-sm font-medium">Download</span>
              </Button>
            )}
            {onShare && (
              <Button
                variant="ghost"
                onClick={(e) => { e.stopPropagation(); onShare(); }}
                className={cn(
                  `h-11 rounded-full bg-card/70 hover:bg-card active:scale-95 transition-all ${SPRING_EASE}`,
                  "text-foreground px-5 gap-2 backdrop-blur-sm border border-border/40"
                )}
              >
                <Share2 className="w-4 h-4" />
                <span className="text-sm font-medium">Share</span>
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MobilePDFViewer;
