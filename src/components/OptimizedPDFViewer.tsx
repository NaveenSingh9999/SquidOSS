import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ZoomIn, ZoomOut, RotateCw, Download,
  ChevronLeft, ChevronRight, Loader2, Grid, List
} from '@/lib/icon-map';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import pdfjsLib from '@/lib/pdfjs-config';
import { useToast } from '@/hooks/use-toast';

interface OptimizedPDFViewerProps {
  file: {
    id: string;
    name: string;
    size: number;
    file_path?: string;
  };
  blobUrl?: string;
  pdfBlob?: Blob | null;
  isMobile?: boolean;
  onClose?: () => void;
  onDownload?: () => void;
}

interface PageCache {
  canvas: HTMLCanvasElement;
  scale: number;
  rotation: number;
}

const OptimizedPDFViewer: React.FC<OptimizedPDFViewerProps> = ({ 
  file, 
  blobUrl, 
  pdfBlob,
  isMobile = false, 
  onClose,
  onDownload 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const lastContainerSizeRef = useRef<{ width: number; height: number } | null>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderTasksRef = useRef<Map<number, any>>(new Map());
  const pageCacheRef = useRef<Map<number, PageCache>>(new Map());
  
  const [pdf, setPdf] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [renderingPages, setRenderingPages] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<'single' | 'continuous'>('single');
  const [fitMode, setFitMode] = useState<'width' | 'height' | 'page'>('width');
  
  const { toast } = useToast();

  const updateScaleIfNeeded = useCallback((nextScale: number) => {
    const normalized = Number.isFinite(nextScale)
      ? Math.min(3, Math.max(0.4, nextScale))
      : 1;

    setScale((prev) => {
      if (Math.abs(prev - normalized) < 0.01) {
        return prev;
      }
      return normalized;
    });
  }, []);
  
  // Calculate optimal scale based on container and fit mode
  const calculateOptimalScale = useCallback((page: any) => {
    if (!containerRef.current) return 1;
    
    const containerWidth = Math.max(containerRef.current.clientWidth - 48, 320);
    const containerHeight = Math.max(containerRef.current.clientHeight - 48, 320);
    const viewport = page.getViewport({ scale: 1, rotation });

    if (!viewport.width || !viewport.height) return 1;

    const clamp = (value: number) => Math.min(3, Math.max(0.4, value || 1));
    
    switch (fitMode) {
      case 'width':
        return clamp(containerWidth / viewport.width);
      case 'height':
        return clamp(containerHeight / viewport.height);
      case 'page':
        return clamp(Math.min(
          containerWidth / viewport.width,
          containerHeight / viewport.height
        ));
      default:
        return 1;
    }
  }, [rotation, fitMode]);

  // Load PDF
  useEffect(() => {
    let cancelled = false;
    
    const loadPDF = async () => {
      try {
        setLoading(true);
        const pdfUrl = blobUrl || file.file_path;
        if (!pdfUrl && !pdfBlob) throw new Error('No PDF source available');
        
        let arrayBuffer: ArrayBuffer;

        if (pdfBlob) {
          arrayBuffer = await pdfBlob.arrayBuffer();
        } else {
          // Fetch URL and convert to ArrayBuffer for reliable loading
          const response = await fetch(pdfUrl as string);
          if (!response.ok) {
            throw new Error(`Failed to fetch PDF: ${response.status}`);
          }
          const blob = await response.blob();
          arrayBuffer = await blob.arrayBuffer();
        }
        
        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.149/cmaps/',
          cMapPacked: true,
          useSystemFonts: true,
        });
        
        const pdfDoc = await loadingTask.promise;
        if (cancelled) return;
        
        setPdf(pdfDoc);
        setTotalPages(pdfDoc.numPages);
        
        // Calculate initial scale based on first page width for predictable first paint
        const firstPage = await pdfDoc.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1, rotation: 0 });
        const containerWidth = Math.max((containerRef.current?.clientWidth ?? viewport.width) - 48, 320);
        const initialScale = viewport.width > 0 ? containerWidth / viewport.width : 1;
        updateScaleIfNeeded(initialScale);
        
        setLoading(false);
      } catch (error) {
        console.error('Error loading PDF:', error);
        if (!cancelled) {
          toast({
            title: "PDF Load Error",
            description: "Failed to load PDF file",
            variant: "destructive"
          });
          setLoading(false);
        }
      }
    };

    loadPDF();
    return () => { cancelled = true; };
  }, [file.file_path, blobUrl, pdfBlob, toast, updateScaleIfNeeded]);

  useEffect(() => {
    if (!pdf) return;

    let cancelled = false;

    const applyFitMode = async () => {
      const firstPage = await pdf.getPage(1);
      if (cancelled) return;

      const optimalScale = calculateOptimalScale(firstPage);
      updateScaleIfNeeded(optimalScale);
    };

    applyFitMode();
    return () => {
      cancelled = true;
    };
  }, [pdf, fitMode, rotation, calculateOptimalScale, updateScaleIfNeeded]);

  useEffect(() => {
    if (!pdf || !containerRef.current) return;

    const observerTarget = containerRef.current;

    const observer = new ResizeObserver(() => {
      const width = observerTarget.clientWidth;
      const height = observerTarget.clientHeight;
      const previousSize = lastContainerSizeRef.current;

      if (
        previousSize &&
        Math.abs(previousSize.width - width) < 2 &&
        Math.abs(previousSize.height - height) < 2
      ) {
        return;
      }

      lastContainerSizeRef.current = { width, height };

      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
      }

      resizeFrameRef.current = requestAnimationFrame(async () => {
        const firstPage = await pdf.getPage(1);
        const optimalScale = calculateOptimalScale(firstPage);
        updateScaleIfNeeded(optimalScale);
        resizeFrameRef.current = null;
      });
    });

    observer.observe(observerTarget);
    return () => {
      observer.disconnect();
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [pdf, calculateOptimalScale, updateScaleIfNeeded]);

  // Cancel existing render task for a page
  const cancelRenderTask = useCallback((pageNum: number) => {
    const existingTask = renderTasksRef.current.get(pageNum);
    if (existingTask) {
      try {
        existingTask.cancel();
      } catch (e) {
        // Ignore cancellation errors
      }
      renderTasksRef.current.delete(pageNum);
    }
  }, []);

  // Render a single page with anti-jitter
  const renderPage = useCallback(async (pageNum: number, canvas: HTMLCanvasElement) => {
    if (!pdf || !canvas) return;

    if (renderTasksRef.current.has(pageNum)) {
      return;
    }
    
    // Check cache first
    const cached = pageCacheRef.current.get(pageNum);
    if (cached && cached.scale === scale && cached.rotation === rotation) {
      return; // Already rendered with same params
    }
    
    // Cancel any existing render for this page
    cancelRenderTask(pageNum);
    
    setRenderingPages(prev => {
      if (prev.has(pageNum)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(pageNum);
      return next;
    });
    
    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale, rotation });
      
      // Use offscreen canvas for smooth rendering
      const offscreenCanvas = document.createElement('canvas');
      const ctx = offscreenCanvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
      });
      
      if (!ctx) return;
      
      // Set dimensions on offscreen canvas
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      offscreenCanvas.width = viewport.width * pixelRatio;
      offscreenCanvas.height = viewport.height * pixelRatio;
      
      ctx.scale(pixelRatio, pixelRatio);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, viewport.width, viewport.height);
      
      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
        intent: 'display',
      });
      
      renderTasksRef.current.set(pageNum, renderTask);
      
      await renderTask.promise;
      
      // Copy to visible canvas using requestAnimationFrame for smooth update
      requestAnimationFrame(() => {
        const visibleCtx = canvas.getContext('2d', { alpha: false });
        if (visibleCtx) {
          canvas.width = offscreenCanvas.width;
          canvas.height = offscreenCanvas.height;
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          visibleCtx.drawImage(offscreenCanvas, 0, 0);
        }
      });
      
      // Cache the result
      pageCacheRef.current.set(pageNum, { canvas, scale, rotation });
      renderTasksRef.current.delete(pageNum);
      
    } catch (error: any) {
      if (error?.name !== 'RenderingCancelledException') {
        console.error(`Error rendering page ${pageNum}:`, error);
      }
    } finally {
      setRenderingPages(prev => {
        if (!prev.has(pageNum)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(pageNum);
        return next;
      });
    }
  }, [pdf, scale, rotation, cancelRenderTask]);

  // Render visible pages in continuous mode
  const renderVisiblePages = useCallback(() => {
    if (!pdf || viewMode !== 'continuous') return;
    
    const buffer = 1; // Keep a tight window for smoother scrolling on large documents.
    const startPage = Math.max(1, currentPage - buffer);
    const endPage = Math.min(totalPages, currentPage + buffer);
    
    for (let i = startPage; i <= endPage; i++) {
      const canvas = canvasRefs.current.get(i);
      if (canvas) {
        renderPage(i, canvas);
      }
    }
  }, [pdf, viewMode, currentPage, totalPages, renderPage]);

  // Render current page in single mode
  useEffect(() => {
    if (!pdf || viewMode !== 'single') return;
    
    const canvas = canvasRefs.current.get(currentPage);
    if (canvas) {
      renderPage(currentPage, canvas);
    }
  }, [pdf, currentPage, viewMode, renderPage]);

  // Handle continuous scrolling
  useEffect(() => {
    renderVisiblePages();
  }, [renderVisiblePages]);

  // Cleanup render tasks on unmount
  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
      }
      renderTasksRef.current.forEach((task) => {
        try { task.cancel(); } catch (e) {}
      });
      renderTasksRef.current.clear();
      pageCacheRef.current.clear();
    };
  }, []);

  // Clear cache when scale/rotation changes
  useEffect(() => {
    pageCacheRef.current.clear();
  }, [scale, rotation]);

  // Scroll handler for continuous mode
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || viewMode !== 'continuous' || totalPages <= 1) return;
    if (scrollRafRef.current !== null) return;

    scrollRafRef.current = requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container) {
        scrollRafRef.current = null;
        return;
      }

      const maxScrollable = Math.max(container.scrollHeight - container.clientHeight, 1);
      const progress = container.scrollTop / maxScrollable;
      const nextPage = Math.min(totalPages, Math.max(1, Math.round(progress * (totalPages - 1)) + 1));

      if (nextPage !== currentPage) {
        setCurrentPage(nextPage);
      }

      scrollRafRef.current = null;
    });
  }, [viewMode, totalPages, currentPage]);

  // Register canvas ref
  const setCanvasRef = useCallback((pageNum: number, canvas: HTMLCanvasElement | null) => {
    if (canvas) {
      canvasRefs.current.set(pageNum, canvas);
    } else {
      canvasRefs.current.delete(pageNum);
    }
  }, []);

  const zoomIn = () => setScale(prev => Math.min(3, prev * 1.25));
  const zoomOut = () => setScale(prev => Math.max(0.3, prev * 0.8));
  const rotate = () => setRotation(prev => (prev + 90) % 360);
  
  const goToPage = (page: number) => {
    const targetPage = Math.max(1, Math.min(totalPages, page));
    setCurrentPage(targetPage);
    
    if (viewMode === 'continuous' && scrollContainerRef.current) {
      const pageHeight = scrollContainerRef.current.scrollHeight / totalPages;
      scrollContainerRef.current.scrollTop = (targetPage - 1) * pageHeight;
    }
  };

  const handleSliderChange = (value: number[]) => {
    goToPage(value[0]);
  };

  const controlButtonClass = "liquid-glass-button h-8 w-8 p-0 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-105 active:scale-95";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 liquid-glass-surface rounded-2xl">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading PDF...</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-gradient-to-b from-background via-background to-muted/20">
      {/* Toolbar with liquid glass effect */}
      <div className={cn(
        "liquid-glass-nav sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border/40 p-3 rounded-t-xl backdrop-blur-xl",
        "data-[state=open]:animate-in data-[state=open]:slide-in-from-top-1",
        isMobile ? "flex-wrap gap-2" : ""
      )}>
        {/* View controls */}
        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={zoomOut}
            className={controlButtonClass}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm font-mono min-w-[60px] text-center text-foreground">
            {Math.round(scale * 100)}%
          </span>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={zoomIn}
            className={controlButtonClass}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border/50" />
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={rotate}
            className={controlButtonClass}
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button 
            size="sm" 
            variant={viewMode === 'continuous' ? 'default' : 'ghost'} 
            onClick={() => setViewMode('continuous')}
            className={controlButtonClass}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button 
            size="sm" 
            variant={viewMode === 'single' ? 'default' : 'ghost'} 
            onClick={() => setViewMode('single')}
            className={controlButtonClass}
          >
            <Grid className="h-4 w-4" />
          </Button>
        </div>

        {/* Page navigation */}
        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            className={controlButtonClass}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-mono text-foreground">
            {currentPage} / {totalPages}
          </span>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className={controlButtonClass}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Actions */}
        {onDownload && (
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={onDownload}
            className={controlButtonClass}
          >
            <Download className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* PDF Content Area */}
      <div 
        ref={scrollContainerRef}
        className={cn(
          "flex-1 overflow-auto overscroll-contain bg-muted/30 relative",
          "scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
        )}
        onScroll={handleScroll}
      >
        <div className="flex flex-col items-center py-4 gap-4 min-h-full">
          {viewMode === 'continuous' ? (
            // Continuous scrolling mode
            Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
              <div 
                key={pageNum}
                className={cn(
                  "relative shadow-lg rounded-lg overflow-hidden transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  "hover:shadow-xl hover:-translate-y-0.5",
                  renderingPages.has(pageNum) && "opacity-90"
                )}
                style={{ contentVisibility: 'auto', containIntrinsicSize: '1280px 960px' }}
              >
                {renderingPages.has(pageNum) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                )}
                <canvas
                  ref={(el) => setCanvasRef(pageNum, el)}
                  className="block bg-white will-change-transform"
                />
                <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-background/80 text-xs text-muted-foreground">
                  {pageNum}
                </div>
              </div>
            ))
          ) : (
            // Single page mode
            <div 
              className={cn(
                "relative shadow-lg rounded-lg overflow-hidden",
                renderingPages.has(currentPage) && "opacity-90"
              )}
            >
              {renderingPages.has(currentPage) && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
              <canvas
                ref={(el) => setCanvasRef(currentPage, el)}
                className="block bg-white will-change-transform"
              />
            </div>
          )}
        </div>
      </div>

      {/* Page slider */}
      <div className="liquid-glass-nav p-3 rounded-b-xl">
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground w-8">1</span>
          <Slider
            value={[currentPage]}
            min={1}
            max={totalPages}
            step={1}
            onValueCommit={handleSliderChange}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground w-8 text-right">{totalPages}</span>
        </div>
      </div>
    </div>
  );
};

export default OptimizedPDFViewer;
