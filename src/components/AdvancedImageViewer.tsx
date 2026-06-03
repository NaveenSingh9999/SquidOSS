import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { 
  Download, 
  RotateCw, 
  RotateCcw, 
  FlipHorizontal, 
  FlipVertical, 
  Maximize2, 
  Minimize2,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Palette,
  Sun,
  Moon,
  Contrast,
  Droplets,
  Sparkles,
  Image as ImageIcon,
  Move,
  Share2,
  Info,
  X,
  ChevronDown,
  MoreHorizontal,
  Layers,
  Copy,
  Wand2
} from '@/lib/icon-map';
import { formatFileSize } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface AdvancedImageViewerProps {
  src: string;
  alt: string;
  file?: {
    name: string;
    size: number;
    type: string;
    created_at?: string;
    updated_at?: string;
  };
  onDownload?: () => void;
  onShare?: () => void;
}

interface ImageFilters {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
  sepia: number;
  grayscale: number;
  invert: number;
}

// Filter presets
const FILTER_PRESETS = [
  { name: 'Original', icon: ImageIcon, filters: { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, sepia: 0, grayscale: 0, invert: 0 } },
  { name: 'Vivid', icon: Sparkles, filters: { brightness: 105, contrast: 115, saturation: 130, hue: 0, blur: 0, sepia: 0, grayscale: 0, invert: 0 } },
  { name: 'Warm', icon: Sun, filters: { brightness: 105, contrast: 100, saturation: 110, hue: 15, blur: 0, sepia: 20, grayscale: 0, invert: 0 } },
  { name: 'Cool', icon: Moon, filters: { brightness: 100, contrast: 105, saturation: 90, hue: -15, blur: 0, sepia: 0, grayscale: 0, invert: 0 } },
  { name: 'B&W', icon: Contrast, filters: { brightness: 105, contrast: 110, saturation: 0, hue: 0, blur: 0, sepia: 0, grayscale: 100, invert: 0 } },
  { name: 'Vintage', icon: Droplets, filters: { brightness: 95, contrast: 90, saturation: 80, hue: 10, blur: 0, sepia: 40, grayscale: 0, invert: 0 } },
  { name: 'Dramatic', icon: Wand2, filters: { brightness: 95, contrast: 130, saturation: 85, hue: 0, blur: 0, sepia: 0, grayscale: 20, invert: 0 } },
];

const DEFAULT_FILTERS: ImageFilters = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  blur: 0,
  sepia: 0,
  grayscale: 0,
  invert: 0
};

const AdvancedImageViewer: React.FC<AdvancedImageViewerProps> = ({
  src,
  alt,
  file,
  onDownload,
  onShare
}) => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  
  // Transform states
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Touch gesture states
  const [isPinching, setIsPinching] = useState(false);
  const [lastTouchDistance, setLastTouchDistance] = useState(0);
  const [lastTouchCenter, setLastTouchCenter] = useState({ x: 0, y: 0 });
  const lastTap = useRef<number>(0);
  
  // Filter states
  const [filters, setFilters] = useState<ImageFilters>(DEFAULT_FILTERS);
  const [activePreset, setActivePreset] = useState('Original');
  
  // UI states
  const [showFilters, setShowFilters] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [comparePosition, setComparePosition] = useState(50);
  const [isAdjustingCompare, setIsAdjustingCompare] = useState(false);
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  
  // Zoom indicator timeout
  const zoomIndicatorTimeout = useRef<NodeJS.Timeout>();

  // Show zoom indicator temporarily
  const flashZoomIndicator = useCallback(() => {
    setShowZoomIndicator(true);
    if (zoomIndicatorTimeout.current) {
      clearTimeout(zoomIndicatorTimeout.current);
    }
    zoomIndicatorTimeout.current = setTimeout(() => {
      setShowZoomIndicator(false);
    }, 1500);
  }, []);

  // Generate CSS filter string
  const getFilterString = useCallback(() => {
    // Return none to avoid hardware acceleration artifacts (black patches) on Android for large images unless edited
    if (filters.brightness === 100 && filters.contrast === 100 && filters.saturation === 100 && 
        filters.hue === 0 && filters.blur === 0 && filters.sepia === 0 && 
        filters.grayscale === 0 && filters.invert === 0) {
      return 'none';
    }
    
    return [
      `brightness(${filters.brightness}%)`,
      `contrast(${filters.contrast}%)`,
      `saturate(${filters.saturation}%)`,
      `hue-rotate(${filters.hue}deg)`,
      `blur(${filters.blur}px)`,
      `sepia(${filters.sepia}%)`,
      `grayscale(${filters.grayscale}%)`,
      `invert(${filters.invert}%)`
    ].join(' ');
  }, [filters]);

  const fitScale = useMemo(() => {
    if (!imageDimensions.width || !imageDimensions.height || !viewportSize.width || !viewportSize.height) {
      return 1;
    }

    return Math.min(
      viewportSize.width / imageDimensions.width,
      viewportSize.height / imageDimensions.height,
      1
    );
  }, [imageDimensions, viewportSize]);

  const effectiveScale = useMemo(() => {
    return Math.max(0.05, fitScale * zoom);
  }, [fitScale, zoom]);

  const clampPan = useCallback((nextPan: { x: number; y: number }, nextZoom = zoom) => {
    if (!imageDimensions.width || !imageDimensions.height || !viewportSize.width || !viewportSize.height) {
      return nextPan;
    }

    const scaledWidth = imageDimensions.width * fitScale * nextZoom;
    const scaledHeight = imageDimensions.height * fitScale * nextZoom;
    const maxX = Math.max(0, (scaledWidth - viewportSize.width) / 2);
    const maxY = Math.max(0, (scaledHeight - viewportSize.height) / 2);

    return {
      x: Math.min(maxX, Math.max(-maxX, nextPan.x)),
      y: Math.min(maxY, Math.max(-maxY, nextPan.y)),
    };
  }, [imageDimensions, viewportSize, fitScale, zoom]);

  // Generate transform string
  const getTransformString = useCallback(() => {
    const scaleX = effectiveScale * (flipH ? -1 : 1);
    const scaleY = effectiveScale * (flipV ? -1 : 1);

    return [
      `translate(${pan.x}px, ${pan.y}px)`,
      `rotate(${rotation}deg)`,
      `scale(${scaleX}, ${scaleY})`
    ].join(' ');
  }, [effectiveScale, rotation, flipH, flipV, pan]);

  // Check if filters are modified
  const isFiltersModified = useMemo(() => {
    return JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  }, [filters]);

  // Check if transforms are modified
  const isTransformModified = useMemo(() => {
    return rotation !== 0 || flipH || flipV || zoom !== 1 || pan.x !== 0 || pan.y !== 0;
  }, [rotation, flipH, flipV, zoom, pan]);

  // Zoom functions
  const handleZoomIn = useCallback(() => {
    setZoom(prev => {
      const newZoom = Math.min(prev * 1.2, 8);
      setPan(prevPan => clampPan(prevPan, newZoom));
      flashZoomIndicator();
      return newZoom;
    });
  }, [flashZoomIndicator, clampPan]);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => {
      const newZoom = Math.max(prev / 1.2, 1);
      if (newZoom <= 1) {
        setPan({ x: 0, y: 0 });
      } else {
        setPan(prevPan => clampPan(prevPan, newZoom));
      }
      flashZoomIndicator();
      return newZoom;
    });
  }, [flashZoomIndicator, clampPan]);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    flashZoomIndicator();
  }, [flashZoomIndicator]);

  // Pan functions
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPan(clampPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
      return;
    }
    handleZoomOut();
  }, [handleZoomIn, handleZoomOut]);

  // Touch gesture helpers
  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchCenter = (touches: React.TouchList) => {
    if (touches.length < 2) return { x: 0, y: 0 };
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  };

  // Touch gesture handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touches = e.touches;
    
    if (touches.length === 2) {
      setIsPinching(true);
      setIsDragging(false);
      setLastTouchDistance(getTouchDistance(touches));
      setLastTouchCenter(getTouchCenter(touches));
      flashZoomIndicator();
    } else if (touches.length === 1 && zoom > 1) {
      setIsDragging(true);
      setDragStart({
        x: touches[0].clientX - pan.x,
        y: touches[0].clientY - pan.y
      });
    }
  }, [zoom, pan, flashZoomIndicator]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touches = e.touches;

    if (isPinching && touches.length === 2) {
      const newDistance = getTouchDistance(touches);
      const delta = newDistance / lastTouchDistance;

      const newCenter = getTouchCenter(touches);
      setZoom(prev => {
        const nextZoom = Math.min(Math.max(prev * delta, 1), 8);
        setPan(prevPan => clampPan({
          x: prevPan.x + (newCenter.x - lastTouchCenter.x),
          y: prevPan.y + (newCenter.y - lastTouchCenter.y)
        }, nextZoom));
        return nextZoom;
      });
      setLastTouchDistance(newDistance);
      setLastTouchCenter(newCenter);
    } else if (isDragging && touches.length === 1 && zoom > 1) {
      setPan(clampPan({
        x: touches[0].clientX - dragStart.x,
        y: touches[0].clientY - dragStart.y
      }));
    }
  }, [isPinching, isDragging, lastTouchDistance, lastTouchCenter, dragStart, zoom, clampPan]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (isPinching) {
      setIsPinching(false);
      if (zoom < 1.1 && zoom > 0.9) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
      return;
    }

    // Double tap to zoom
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTap.current < DOUBLE_TAP_DELAY && e.changedTouches.length === 1) {
      if (zoom > 1) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      } else {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const touch = e.changedTouches[0];
          const x = touch.clientX - rect.left - rect.width / 2;
          const y = touch.clientY - rect.top - rect.height / 2;
          setZoom(2.5);
          setPan(clampPan({ x: -x * 1.2, y: -y * 1.2 }, 2.5));
        }
      }
      flashZoomIndicator();
    }
    lastTap.current = now;
    setIsDragging(false);
  }, [isPinching, zoom, flashZoomIndicator, clampPan]);

  // Fullscreen functions
  const toggleFullscreen = useCallback(() => {
    if (!isFullscreen && containerRef.current) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }, [isFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateViewport = () => {
      const rect = container.getBoundingClientRect();
      setViewportSize({ width: rect.width, height: rect.height });
    };

    updateViewport();

    const observer = new ResizeObserver(updateViewport);
    observer.observe(container);
    window.addEventListener('resize', updateViewport);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateViewport);
    };
  }, [isFullscreen]);

  useEffect(() => {
    setPan(prev => clampPan(prev, zoom));
  }, [clampPan, zoom, fitScale, viewportSize.width, viewportSize.height]);

  const updateComparePosition = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setComparePosition(Math.max(5, Math.min(95, next)));
  }, []);

  useEffect(() => {
    if (!isAdjustingCompare) return;

    const handlePointerMove = (event: MouseEvent) => {
      updateComparePosition(event.clientX);
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches[0]) {
        updateComparePosition(event.touches[0].clientX);
      }
    };

    const stopAdjusting = () => setIsAdjustingCompare(false);

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', stopAdjusting, { once: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', stopAdjusting, { once: true });

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', stopAdjusting);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', stopAdjusting);
    };
  }, [isAdjustingCompare, updateComparePosition]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target !== document.body) return;
      
      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
          e.preventDefault();
          handleZoomOut();
          break;
        case '0':
          e.preventDefault();
          resetZoom();
          break;
        case 'r':
          e.preventDefault();
          setRotation(prev => (prev + 90) % 360);
          break;
        case 'h':
          e.preventDefault();
          setFlipH(prev => !prev);
          break;
        case 'v':
          e.preventDefault();
          setFlipV(prev => !prev);
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'c':
          e.preventDefault();
          setShowCompare(prev => !prev);
          break;
        case 'i':
          e.preventDefault();
          setShowInfo(prev => !prev);
          break;
        case 'Escape':
          if (isFullscreen) {
            toggleFullscreen();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, handleZoomIn, handleZoomOut, resetZoom, toggleFullscreen]);

  // Apply preset
  const applyPreset = useCallback((preset: typeof FILTER_PRESETS[0]) => {
    setFilters(preset.filters as ImageFilters);
    setActivePreset(preset.name);
  }, []);

  // Reset all filters
  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setActivePreset('Original');
  }, []);

  // Reset all transforms
  const resetTransforms = useCallback(() => {
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    resetZoom();
  }, [resetZoom]);

  // Image load handler
  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    if (imageRef.current) {
      setImageDimensions({
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight
      });
    }
  }, []);

  // Copy image dimensions
  const copyDimensions = useCallback(() => {
    navigator.clipboard.writeText(`${imageDimensions.width} × ${imageDimensions.height}`);
    toast({ title: 'Copied', description: 'Image dimensions copied to clipboard' });
  }, [imageDimensions, toast]);

  // Mobile bottom toolbar
  const MobileToolbar = () => (
    <div className="absolute bottom-0 left-0 right-0 z-20 pb-[env(safe-area-inset-bottom)]">
      <div className="bg-gradient-to-t from-black/90 via-black/70 to-transparent pt-16 pb-4 px-4">
        {/* Quick Actions */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-white/10 backdrop-blur-md rounded-xl p-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleZoomOut}
              className="h-10 w-10 p-0 text-white hover:bg-white/15 active:scale-95 rounded-lg"
            >
              <ZoomOut className="w-5 h-5" />
            </Button>
            <div className="w-14 text-center text-white/80 text-sm font-medium">
              {Math.round(zoom * 100)}%
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleZoomIn}
              className="h-10 w-10 p-0 text-white hover:bg-white/15 active:scale-95 rounded-lg"
            >
              <ZoomIn className="w-5 h-5" />
            </Button>
          </div>
          
          {/* Transform controls */}
          <div className="flex items-center gap-1 bg-white/10 backdrop-blur-md rounded-xl p-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRotation(prev => (prev - 90 + 360) % 360)}
              className="h-10 w-10 p-0 text-white hover:bg-white/15 active:scale-95 rounded-lg"
            >
              <RotateCcw className="w-5 h-5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRotation(prev => (prev + 90) % 360)}
              className="h-10 w-10 p-0 text-white hover:bg-white/15 active:scale-95 rounded-lg"
            >
              <RotateCw className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Main Action Bar */}
        <div className="flex items-center justify-around">
          <Button
            variant="ghost"
            onClick={() => setShowFilters(true)}
            className={cn(
              "flex flex-col items-center gap-1 h-auto py-2.5 px-4 rounded-xl active:scale-95 transition-all",
              isFiltersModified ? "text-primary" : "text-white hover:bg-white/10"
            )}
          >
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              isFiltersModified ? "bg-primary/20" : "bg-white/10"
            )}>
              <Palette className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium">Filters</span>
          </Button>

          <Button
            variant="ghost"
            onClick={() => setShowCompare(!showCompare)}
            className={cn(
              "flex flex-col items-center gap-1 h-auto py-2.5 px-4 rounded-xl active:scale-95 transition-all",
              showCompare ? "text-primary" : "text-white hover:bg-white/10"
            )}
          >
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              showCompare ? "bg-primary/20" : "bg-white/10"
            )}>
              <Layers className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium">Compare</span>
          </Button>

          <Button
            variant="ghost"
            onClick={() => setShowInfo(!showInfo)}
            className={cn(
              "flex flex-col items-center gap-1 h-auto py-2.5 px-4 rounded-xl active:scale-95 transition-all",
              showInfo ? "text-primary" : "text-white hover:bg-white/10"
            )}
          >
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              showInfo ? "bg-primary/20" : "bg-white/10"
            )}>
              <Info className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium">Info</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex flex-col items-center gap-1 h-auto py-2.5 px-4 rounded-xl active:scale-95 transition-all text-white hover:bg-white/10"
              >
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                  <MoreHorizontal className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium">More</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-card/95 backdrop-blur-xl border-border/50">
              <DropdownMenuItem onClick={onDownload} className="gap-3 py-3">
                <Download className="w-4 h-4" />
                Download
              </DropdownMenuItem>
              {onShare && (
                <DropdownMenuItem onClick={onShare} className="gap-3 py-3">
                  <Share2 className="w-4 h-4" />
                  Share
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setFlipH(!flipH)} className="gap-3 py-3">
                <FlipHorizontal className="w-4 h-4" />
                Flip Horizontal
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFlipV(!flipV)} className="gap-3 py-3">
                <FlipVertical className="w-4 h-4" />
                Flip Vertical
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={resetTransforms} className="gap-3 py-3">
                <RefreshCw className="w-4 h-4" />
                Reset All
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );

  // Mobile Filters Sheet
  const MobileFiltersSheet = () => (
    <Sheet open={showFilters} onOpenChange={setShowFilters}>
      <SheetContent side="bottom" className="h-[75vh] rounded-t-3xl">
        <SheetHeader className="pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold">Filters & Adjustments</SheetTitle>
            {isFiltersModified && (
              <Button size="sm" variant="ghost" onClick={resetFilters} className="text-muted-foreground">
                Reset
              </Button>
            )}
          </div>
        </SheetHeader>

        {/* Presets */}
        <div className="mb-6">
          <Label className="text-sm font-medium text-muted-foreground mb-3 block">Presets</Label>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {FILTER_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset)}
                className={cn(
                  "flex-shrink-0 flex flex-col items-center gap-2 p-3 rounded-xl transition-all min-w-[72px]",
                  activePreset === preset.name
                    ? "bg-primary/15 ring-2 ring-primary"
                    : "bg-muted/50 hover:bg-muted"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  activePreset === preset.name ? "bg-primary/20" : "bg-background"
                )}>
                  <preset.icon className={cn(
                    "w-5 h-5",
                    activePreset === preset.name ? "text-primary" : "text-muted-foreground"
                  )} />
                </div>
                <span className={cn(
                  "text-xs font-medium",
                  activePreset === preset.name ? "text-primary" : "text-muted-foreground"
                )}>
                  {preset.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Adjustments */}
        <div className="space-y-5 overflow-y-auto max-h-[45vh] pr-2">
          {[
            { key: 'brightness', label: 'Brightness', icon: Sun, min: 0, max: 200, unit: '%' },
            { key: 'contrast', label: 'Contrast', icon: Contrast, min: 0, max: 200, unit: '%' },
            { key: 'saturation', label: 'Saturation', icon: Droplets, min: 0, max: 200, unit: '%' },
            { key: 'hue', label: 'Hue', icon: Palette, min: -180, max: 180, unit: '°' },
            { key: 'sepia', label: 'Sepia', icon: ImageIcon, min: 0, max: 100, unit: '%' },
            { key: 'grayscale', label: 'Grayscale', icon: Moon, min: 0, max: 100, unit: '%' },
          ].map(({ key, label, icon: Icon, min, max, unit }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm">{label}</Label>
                </div>
                <span className="text-sm text-muted-foreground font-mono">
                  {filters[key as keyof ImageFilters]}{unit}
                </span>
              </div>
              <Slider
                value={[filters[key as keyof ImageFilters]]}
                onValueChange={([value]) => {
                  setFilters(prev => ({ ...prev, [key]: value }));
                  setActivePreset('');
                }}
                min={min}
                max={max}
                step={1}
                className="w-full"
              />
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );

  // Desktop Toolbar
  const DesktopToolbar = () => (
    <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
      {/* Left side - Transform & Zoom */}
      <div className="flex items-center gap-2">
        {/* Zoom Controls */}
        <div className="flex items-center gap-1 bg-black/60 backdrop-blur-xl rounded-xl border border-white/10 p-1.5">
          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={handleZoomOut} className="h-8 w-8 p-0 text-white hover:bg-white/15 rounded-lg">
                  <ZoomOut className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Zoom Out (-)</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Badge variant="secondary" className="min-w-[52px] justify-center bg-white/10 border-0 text-white/80 text-xs font-mono">
            {Math.round(zoom * 100)}%
          </Badge>

          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={handleZoomIn} className="h-8 w-8 p-0 text-white hover:bg-white/15 rounded-lg">
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Zoom In (+)</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Separator orientation="vertical" className="h-5 bg-white/20 mx-1" />

          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={resetZoom} disabled={zoom === 1 && pan.x === 0 && pan.y === 0} className="h-8 w-8 p-0 text-white hover:bg-white/15 rounded-lg disabled:opacity-30">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Reset Zoom (0)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Transform Controls */}
        <div className="flex items-center gap-1 bg-black/60 backdrop-blur-xl rounded-xl border border-white/10 p-1.5">
          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={() => setRotation(prev => (prev - 90 + 360) % 360)} className="h-8 w-8 p-0 text-white hover:bg-white/15 rounded-lg">
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Rotate Left</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={() => setRotation(prev => (prev + 90) % 360)} className="h-8 w-8 p-0 text-white hover:bg-white/15 rounded-lg">
                  <RotateCw className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Rotate Right (R)</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Separator orientation="vertical" className="h-5 bg-white/20 mx-1" />

          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={() => setFlipH(prev => !prev)} className={cn("h-8 w-8 p-0 rounded-lg", flipH ? "bg-white/20 text-white" : "text-white hover:bg-white/15")}>
                  <FlipHorizontal className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Flip Horizontal (H)</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={() => setFlipV(prev => !prev)} className={cn("h-8 w-8 p-0 rounded-lg", flipV ? "bg-white/20 text-white" : "text-white hover:bg-white/15")}>
                  <FlipVertical className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Flip Vertical (V)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Filters & Tools */}
        <div className="flex items-center gap-1 bg-black/60 backdrop-blur-xl rounded-xl border border-white/10 p-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className={cn("h-8 px-3 gap-2 rounded-lg", isFiltersModified ? "bg-primary/20 text-primary hover:bg-primary/30" : "text-white hover:bg-white/15")}>
                <Palette className="w-4 h-4" />
                <span className="text-sm">Filters</span>
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80 p-4 bg-card/95 backdrop-blur-xl" align="start">
              <div className="mb-4">
                <Label className="text-xs text-muted-foreground mb-2 block">Presets</Label>
                <div className="grid grid-cols-4 gap-2">
                  {FILTER_PRESETS.slice(0, 4).map((preset) => (
                    <button key={preset.name} onClick={() => applyPreset(preset)} className={cn("flex flex-col items-center gap-1.5 p-2 rounded-lg transition-all", activePreset === preset.name ? "bg-primary/15 ring-1 ring-primary" : "bg-muted/50 hover:bg-muted")}>
                      <preset.icon className={cn("w-4 h-4", activePreset === preset.name ? "text-primary" : "text-muted-foreground")} />
                      <span className="text-xs">{preset.name}</span>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {FILTER_PRESETS.slice(4).map((preset) => (
                    <button key={preset.name} onClick={() => applyPreset(preset)} className={cn("flex flex-col items-center gap-1.5 p-2 rounded-lg transition-all", activePreset === preset.name ? "bg-primary/15 ring-1 ring-primary" : "bg-muted/50 hover:bg-muted")}>
                      <preset.icon className={cn("w-4 h-4", activePreset === preset.name ? "text-primary" : "text-muted-foreground")} />
                      <span className="text-xs">{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <Separator className="my-3" />
              <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                {[
                  { key: 'brightness', label: 'Brightness', min: 0, max: 200, unit: '%' },
                  { key: 'contrast', label: 'Contrast', min: 0, max: 200, unit: '%' },
                  { key: 'saturation', label: 'Saturation', min: 0, max: 200, unit: '%' },
                  { key: 'hue', label: 'Hue', min: -180, max: 180, unit: '°' },
                  { key: 'sepia', label: 'Sepia', min: 0, max: 100, unit: '%' },
                  { key: 'grayscale', label: 'Grayscale', min: 0, max: 100, unit: '%' },
                ].map(({ key, label, min, max, unit }) => (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs">{label}</Label>
                      <span className="text-xs text-muted-foreground font-mono">{filters[key as keyof ImageFilters]}{unit}</span>
                    </div>
                    <Slider value={[filters[key as keyof ImageFilters]]} onValueChange={([value]) => { setFilters(prev => ({ ...prev, [key]: value })); setActivePreset(''); }} min={min} max={max} step={1} />
                  </div>
                ))}
              </div>
              <Separator className="my-3" />
              <Button size="sm" variant="outline" onClick={resetFilters} className="w-full">
                <RefreshCw className="w-3 h-3 mr-2" />
                Reset Filters
              </Button>
            </DropdownMenuContent>
          </DropdownMenu>

          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={() => setShowCompare(!showCompare)} className={cn("h-8 w-8 p-0 rounded-lg", showCompare ? "bg-primary/20 text-primary" : "text-white hover:bg-white/15")}>
                  <Layers className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Compare (C)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Right side - Actions */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-black/60 backdrop-blur-xl rounded-xl border border-white/10 p-1.5">
          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={() => setShowInfo(!showInfo)} className={cn("h-8 w-8 p-0 rounded-lg", showInfo ? "bg-white/20 text-white" : "text-white hover:bg-white/15")}>
                  <Info className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Image Info (I)</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {onShare && (
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" onClick={onShare} className="h-8 w-8 p-0 text-white hover:bg-white/15 rounded-lg">
                    <Share2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Share</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={onDownload} className="h-8 w-8 p-0 text-white hover:bg-white/15 rounded-lg">
                  <Download className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Download</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Separator orientation="vertical" className="h-5 bg-white/20 mx-1" />

          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={toggleFullscreen} className="h-8 w-8 p-0 text-white hover:bg-white/15 rounded-lg">
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Fullscreen (F)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );

  // Info Panel
  const InfoPanel = () => (
    <div className={cn("absolute z-10 bg-black/70 backdrop-blur-xl rounded-2xl border border-white/10 text-white overflow-hidden", isMobile ? "bottom-32 left-4 right-4 p-4" : "bottom-4 left-4 p-4 min-w-[280px] max-w-[320px]")}>
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-sm">Image Details</h3>
        <Button size="sm" variant="ghost" onClick={() => setShowInfo(false)} className="h-6 w-6 p-0 text-white/60 hover:text-white hover:bg-white/10 rounded-lg -mr-1 -mt-1">
          <X className="w-4 h-4" />
        </Button>
      </div>
      
      <div className="space-y-2.5 text-sm">
        {file?.name && (
          <div className="flex items-start gap-3">
            <span className="text-white/50 min-w-[70px]">Name</span>
            <span className="text-white/90 truncate flex-1 font-medium">{file.name}</span>
          </div>
        )}
        
        {imageDimensions.width > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-white/50 min-w-[70px]">Size</span>
            <span className="text-white/90 font-mono text-xs">{imageDimensions.width} × {imageDimensions.height}</span>
            <Button size="sm" variant="ghost" onClick={copyDimensions} className="h-5 w-5 p-0 text-white/40 hover:text-white hover:bg-white/10 rounded">
              <Copy className="w-3 h-3" />
            </Button>
          </div>
        )}
        
        {file?.size && (
          <div className="flex items-center gap-3">
            <span className="text-white/50 min-w-[70px]">File Size</span>
            <span className="text-white/90">{formatFileSize(file.size)}</span>
          </div>
        )}
        
        {file?.type && (
          <div className="flex items-center gap-3">
            <span className="text-white/50 min-w-[70px]">Format</span>
            <Badge variant="secondary" className="bg-white/10 border-0 text-white/80 text-xs">{file.type.split('/')[1]?.toUpperCase() || file.type}</Badge>
          </div>
        )}
        
        {isTransformModified && (
          <>
            <Separator className="bg-white/10 my-2" />
            <div className="flex items-center gap-3">
              <span className="text-white/50 min-w-[70px]">Transform</span>
              <div className="flex items-center gap-1 flex-wrap">
                {rotation !== 0 && <Badge variant="secondary" className="bg-white/10 border-0 text-white/70 text-xs">{rotation}°</Badge>}
                {flipH && <Badge variant="secondary" className="bg-white/10 border-0 text-white/70 text-xs">Flip H</Badge>}
                {flipV && <Badge variant="secondary" className="bg-white/10 border-0 text-white/70 text-xs">Flip V</Badge>}
              </div>
            </div>
          </>
        )}
        
        {isFiltersModified && activePreset && (
          <>
            <Separator className="bg-white/10 my-2" />
            <div className="flex items-center gap-3">
              <span className="text-white/50 min-w-[70px]">Filter</span>
              <Badge variant="secondary" className="bg-primary/20 border-0 text-primary text-xs">{activePreset}</Badge>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className={cn("relative w-full h-full bg-neutral-950 overflow-hidden select-none", isFullscreen ? "fixed inset-0 z-[70]" : "")}>
      {/* Desktop Toolbar */}
      {!isMobile && <DesktopToolbar />}

      {/* Image Container */}
      <div
        className={cn("w-full h-full flex items-center justify-center overflow-hidden", zoom > 1 ? "cursor-grab" : "cursor-default", isDragging && "cursor-grabbing")}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      >
        {/* Compare Mode - Before Image (unfiltered) */}
        {showCompare && isFiltersModified && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ clipPath: `polygon(0 0, ${comparePosition}% 0, ${comparePosition}% 100%, 0 100%)` }}>
            <div className="w-full h-full flex items-center justify-center">
              <img
                src={src}
                alt={`${alt} - Original`}
                className={cn(
                  "max-w-none max-h-none will-change-transform",
                  !isPinching && !isDragging ? "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]" : ""
                )}
                style={{
                  transform: getTransformString(),
                  transformOrigin: 'center',
                  willChange: 'transform',
                  imageRendering: 'auto',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                }}
                draggable={false}
              />
            </div>
          </div>
        )}

        {/* Main Image */}
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          className={cn(
            "max-w-none max-h-none will-change-transform",
            !isPinching && !isDragging ? "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]" : "",
            !imageLoaded && "opacity-0"
          )}
          style={{
            filter: getFilterString(),
            transform: getTransformString(),
            transformOrigin: 'center',
            touchAction: 'none',
            willChange: 'transform, filter',
            imageRendering: 'auto',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
          onLoad={handleImageLoad}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          draggable={false}
        />

        {/* Compare Slider */}
        {showCompare && isFiltersModified && (
          <div
            className="absolute top-0 bottom-0 w-1 bg-white shadow-lg cursor-ew-resize z-30"
            style={{ left: `${comparePosition}%` }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsAdjustingCompare(true);
              updateComparePosition(e.clientX);
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsAdjustingCompare(true);
              if (e.touches[0]) {
                updateComparePosition(e.touches[0].clientX);
              }
            }}
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-xl flex items-center justify-center">
              <Move className="w-5 h-5 text-neutral-700" />
            </div>
            <div className="absolute top-4 -left-12 bg-black/60 text-white text-xs px-2 py-1 rounded-full">Before</div>
            <div className="absolute top-4 left-4 bg-black/60 text-white text-xs px-2 py-1 rounded-full">After</div>
          </div>
        )}
      </div>

      {/* Zoom Indicator */}
      {(showZoomIndicator || isPinching) && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
          <div className="bg-black/70 backdrop-blur-md rounded-2xl px-5 py-3 text-white font-medium text-xl">{Math.round(zoom * 100)}%</div>
        </div>
      )}

      {/* Pan Indicator for Mobile */}
      {isMobile && zoom > 1 && !isDragging && !isPinching && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5 text-white/70 text-xs flex items-center gap-1.5">
            <Move className="w-3 h-3" />
            Drag to pan
          </div>
        </div>
      )}

      {/* Mobile Toolbar */}
      {isMobile && <MobileToolbar />}
      
      {/* Mobile Filters Sheet */}
      {isMobile && <MobileFiltersSheet />}

      {/* Info Panel */}
      {showInfo && <InfoPanel />}

      {/* Keyboard Shortcuts Help - Desktop Fullscreen */}
      {isFullscreen && !isMobile && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 px-4 py-2 text-white text-xs z-20">
          <div className="flex gap-4 text-white/70">
            <span><kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/90">+/-</kbd> Zoom</span>
            <span><kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/90">R</kbd> Rotate</span>
            <span><kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/90">H/V</kbd> Flip</span>
            <span><kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/90">C</kbd> Compare</span>
            <span><kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/90">I</kbd> Info</span>
            <span><kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/90">Esc</kbd> Exit</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvancedImageViewer;
