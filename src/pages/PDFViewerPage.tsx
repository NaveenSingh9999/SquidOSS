import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import pdfjsLib from '@/lib/pdfjs-config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { PDFSecurityService } from '@/services/pdfSecurity';
import AppleLoader from '@/components/ui/AppleLoader';
import { cn } from '@/lib/utils';
import { usePDFLazyLoad } from '@/hooks/use-pdf-lazy-load';
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  Search,
  ArrowLeft,
  RotateCw,
  Maximize2,
  Minimize2,
  Home,
  PanelLeftClose,
  PanelLeft,
  FileText,
  Presentation,
  BookmarkPlus,
  Highlighter,
  Type,
  Moon,
  Sun,
  Grid3x3,
  Layers,
  X
} from '@/lib/icon-map';

const PDFViewerPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const thumbnailRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTasksRef = useRef<Map<number, any>>(new Map());
  
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0); // Start at fit-to-width
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(false);
  const [renderingPages, setRenderingPages] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{page: number, text: string}>>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode] = useState(true); // Always dark mode
  const [presentationMode, setPresentationMode] = useState(false);
  const [viewMode, setViewMode] = useState<'single' | 'continuous'>('continuous');
  const [pageCache, setPageCache] = useState<Map<number, ImageBitmap>>(new Map());
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]));
  const [autoLoadEnabled, setAutoLoadEnabled] = useState(true);
  
  // Drawing/annotation state
  const [isDrawing, setIsDrawing] = useState(false);
  const [showDrawTools, setShowDrawTools] = useState(false);
  const [brushColor, setBrushColor] = useState('#FF6B6B');
  const [brushSize, setBrushSize] = useState(3);
  const [drawingMode, setDrawingMode] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [annotations, setAnnotations] = useState<Map<number, Array<{
    type: string;
    color: string;
    size: number;
    points: Array<{x: number, y: number}>;
  }>>>(new Map());
  
  // PDF cache in localStorage
  const [pdfCacheKey, setPdfCacheKey] = useState<string>('');

  // Generate secure PDF URL and load document
  useEffect(() => {
    if (!id || !user) {
      setError('Invalid PDF access request');
      return;
    }

    const generateSecurePDFUrl = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log('Generating secure PDF URL for ID:', id);
        
        // Check cache first
        const cacheKey = `pdf_cache_${id}_${user.id}`;
        setPdfCacheKey(cacheKey);
        
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
          try {
            const cached = JSON.parse(cachedData);
            const cacheAge = Date.now() - cached.timestamp;
            // Cache valid for 1 hour
            if (cacheAge < 3600000) {
              console.log('Loading PDF from cache');
              setFileUrl(cached.url);
              setFileName(cached.fileName);
              setLoading(false);
              toast({
                title: "Loaded from cache",
                description: "PDF loaded instantly from cache",
              });
              return;
            }
          } catch (e) {
            console.log('Cache invalid, fetching fresh');
          }
        }
        
        // Get file data first
        const { data: fileData, error: fileError } = await supabase
          .from('files')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .single();
          
        if (fileError || !fileData) {
          throw new Error('File not found or access denied');
        }
        
        // Use our PDF security service to generate the secure URL
        const pdfUrl = await PDFSecurityService.generateSecurePDFUrl(fileData);
        
        setFileUrl(pdfUrl);
        setFileName(fileData.name || 'document.pdf');
        
        // Cache the URL and metadata
        localStorage.setItem(cacheKey, JSON.stringify({
          url: pdfUrl,
          fileName: fileData.name,
          timestamp: Date.now()
        }));
        
        console.log('Secure PDF URL generated and cached successfully');
        
      } catch (err: any) {
        console.error('PDF URL generation failed:', err);
        setError(err.message || 'Failed to load PDF');
        toast({
          title: "PDF Access Error",
          description: err.message || 'Failed to access PDF. The link may have expired.',
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    generateSecurePDFUrl();
  }, [id, user, toast]);

  // Load PDF document when URL is available
  useEffect(() => {
    if (!fileUrl) return;

    const loadPDF = async () => {
      try {
        setLoading(true);
        console.log('Loading PDF with enhanced rendering...');
        
        // Enhanced PDF.js loading with better quality settings
        const loadingTask = pdfjsLib.getDocument({
          url: fileUrl,
          cMapUrl: '/pdfjs/cmaps/',
          cMapPacked: true,
          // Enhanced rendering options
          standardFontDataUrl: '/pdfjs/standard_fonts/',
          useSystemFonts: false,
          disableFontFace: false,
          maxImageSize: 1024 * 1024 * 50, // 50MB max image size
        });
        
        const pdfDoc = await loadingTask.promise;
        
        setPdf(pdfDoc);
        setTotalPages(pdfDoc.numPages);
        setCurrentPage(1);
        
        console.log('PDF loaded successfully. Pages:', pdfDoc.numPages);
        
        // Pre-generate thumbnails for all pages
        generateAllThumbnails(pdfDoc);
      } catch (error) {
        console.error('Error loading PDF:', error);
        setError('Failed to load PDF document');
        toast({
          title: "PDF Loading Error",
          description: "Failed to load the PDF file. It may be corrupted.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    loadPDF();
  }, [fileUrl, toast]);

  // Cleanup blob URLs and cache on unmount
  useEffect(() => {
    return () => {
      // Cancel all ongoing render tasks
      renderTasksRef.current.forEach((task, pageNum) => {
        try {
          task.cancel();
        } catch (e) {
          // Ignore cancellation errors
        }
      });
      renderTasksRef.current.clear();
      
      if (fileUrl && id) {
        PDFSecurityService.cleanupPDFUrl(fileUrl, id);
      }
      // Cleanup page cache
      pageCache.forEach(bitmap => bitmap.close());
      
      // Clean up old caches (older than 24 hours)
      const now = Date.now();
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('pdf_cache_')) {
          try {
            const cached = JSON.parse(localStorage.getItem(key) || '');
            if (now - cached.timestamp > 86400000) { // 24 hours
              localStorage.removeItem(key);
            }
          } catch (e) {
            localStorage.removeItem(key);
          }
        }
      });
    };
  }, [fileUrl, id, pageCache]);

  // Generate thumbnails for all pages
  const generateAllThumbnails = useCallback(async (pdfDoc: pdfjsLib.PDFDocumentProxy) => {
    const newThumbnails = new Map<number, string>();
    
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 0.3 });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvasContext: context,
          viewport: viewport,
          canvas: canvas
        }).promise;

        const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
        newThumbnails.set(pageNum, thumbnail);
      } catch (error) {
        console.error(`Error generating thumbnail for page ${pageNum}:`, error);
      }
    }
    
    setThumbnails(newThumbnails);
  }, []);

  // Optimized render with requestAnimationFrame and proper task cancellation
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdf) return;
    
    // Cancel any existing render task for this page
    const existingTask = renderTasksRef.current.get(pageNum);
    if (existingTask) {
      try {
        existingTask.cancel();
      } catch (e) {
        // Ignore cancellation errors
      }
      renderTasksRef.current.delete(pageNum);
    }
    
    // Skip if already rendering
    if (renderingPages.has(pageNum)) return;
    
    setRenderingPages(prev => new Set(prev).add(pageNum));
    
    try {
      const page = await pdf.getPage(pageNum);
      const canvas = canvasRefs.current.get(pageNum);
      
      if (!canvas) {
        setRenderingPages(prev => {
          const newSet = new Set(prev);
          newSet.delete(pageNum);
          return newSet;
        });
        return;
      }
      
      const context = canvas.getContext('2d', { 
        alpha: false,
        willReadFrequently: false,
        desynchronized: true
      });
      if (!context) return;
      
      // Calculate fit-to-screen scale
      const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
      const dpr = window.devicePixelRatio || 1;
      const baseViewport = page.getViewport({ scale: 1, rotation });
      
      // Fit to width with padding
      const fitScale = (containerWidth - 48) / baseViewport.width;
      const finalScale = scale * Math.min(fitScale, 2.5); // Cap at 2.5x for performance
      const enhancedScale = finalScale * dpr;
      
      const viewport = page.getViewport({ scale: enhancedScale, rotation });
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;
      
      // High quality rendering with GPU acceleration hints
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      
      // Create render task and store it
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        canvas: canvas
      };
      
      const renderTask = page.render(renderContext);
      renderTasksRef.current.set(pageNum, renderTask);
      
      // Use requestAnimationFrame for smooth rendering
      requestAnimationFrame(async () => {
        try {
          await renderTask.promise;
          
          // Fast enhancement (only contrast, skip heavy processing)
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          
          // Optimized contrast enhancement
          for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, data[i] * 1.03);
            data[i + 1] = Math.min(255, data[i + 1] * 1.03);
            data[i + 2] = Math.min(255, data[i + 2] * 1.03);
          }
          
          context.putImageData(imageData, 0, 0);
          
          // Restore annotation layer if exists
          const pageAnnotations = annotations.get(pageNum);
          if (pageAnnotations && pageAnnotations.length > 0) {
            pageAnnotations.forEach(annotation => {
              drawAnnotation(context, annotation);
            });
          }
          
          // Clean up render task
          renderTasksRef.current.delete(pageNum);
        } catch (error: any) {
          if (error?.name !== 'RenderingCancelledException') {
            console.error(`Error rendering page ${pageNum}:`, error);
          }
        }
      });
      
    } catch (error) {
      console.error(`Error rendering page ${pageNum}:`, error);
    } finally {
      setRenderingPages(prev => {
        const newSet = new Set(prev);
        newSet.delete(pageNum);
        return newSet;
      });
    }
  }, [pdf, scale, rotation, renderingPages, annotations]);

  // Draw annotation helper
  const drawAnnotation = (ctx: CanvasRenderingContext2D, annotation: any) => {
    if (!annotation.points || annotation.points.length < 2) return;
    
    ctx.globalCompositeOperation = annotation.type === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = annotation.type === 'highlighter' ? `${annotation.color}80` : annotation.color;
    ctx.lineWidth = annotation.size * (annotation.type === 'highlighter' ? 3 : 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    ctx.moveTo(annotation.points[0].x, annotation.points[0].y);
    
    for (let i = 1; i < annotation.points.length; i++) {
      ctx.lineTo(annotation.points[i].x, annotation.points[i].y);
    }
    
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  };

  // AI Enhancement for better quality (simulated - can integrate real AI models)
  const applyAIEnhancement = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // Apply sharpening filter
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Simple sharpening kernel
    const kernel = [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0
    ];
    
    // Apply contrast enhancement
    for (let i = 0; i < data.length; i += 4) {
      // Enhance contrast slightly
      data[i] = Math.min(255, data[i] * 1.05);     // R
      data[i + 1] = Math.min(255, data[i + 1] * 1.05); // G
      data[i + 2] = Math.min(255, data[i + 2] * 1.05); // B
    }
    
    ctx.putImageData(imageData, 0, 0);
  };

  // Render current page when it changes
  useEffect(() => {
    if (!pdf) return;

    const canvas = canvasRefs.current.get(currentPage);
    if (canvas) {
      renderPage(currentPage);
    }
  }, [pdf, currentPage, scale, rotation, renderPage]);

  // Search functionality with text extraction
  const handleSearch = useCallback(async () => {
    if (!pdf || !searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const results: Array<{page: number, text: string}> = [];
      const searchLower = searchTerm.toLowerCase();

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');

        if (pageText.toLowerCase().includes(searchLower)) {
          // Find context around the search term
          const index = pageText.toLowerCase().indexOf(searchLower);
          const start = Math.max(0, index - 50);
          const end = Math.min(pageText.length, index + searchTerm.length + 50);
          const context = '...' + pageText.substring(start, end) + '...';
          
          results.push({ page: pageNum, text: context });
        }
      }

      setSearchResults(results);
      
      if (results.length > 0) {
        toast({
          title: "Search Results",
          description: `Found ${results.length} result(s) in ${results.length} page(s)`,
        });
        // Jump to first result
        setCurrentPage(results[0].page);
      } else {
        toast({
          title: "No Results",
          description: `No matches found for "${searchTerm}"`,
        });
      }
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: "Search Error",
        description: "Failed to search the document",
        variant: "destructive",
      });
    }
  }, [pdf, searchTerm, toast]);

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      scrollToPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
      scrollToPage(currentPage + 1);
    }
  };

  const scrollToPage = (pageNum: number) => {
    const pageElement = document.getElementById(`pdf-page-${pageNum}`);
    if (pageElement) {
      pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleZoomIn = () => {
    setScale(prevScale => Math.min(prevScale * 1.25, 4.0));
  };

  const handleZoomOut = () => {
    setScale(prevScale => Math.max(prevScale / 1.25, 0.25));
  };

  const handleFitToWidth = () => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth - 64;
      setScale(containerWidth / 612); // 612 is standard PDF width
    }
  };

  const handleFitToPage = () => {
    if (containerRef.current) {
      const containerHeight = containerRef.current.clientHeight - 64;
      setScale(containerHeight / 792); // 792 is standard PDF height
    }
  };

  const handleRotate = () => {
    setRotation(prevRotation => (prevRotation + 90) % 360);
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined' && window.print) {
      window.print();
    } else {
      toast({
        title: "Print Unavailable",
        description: "Printing is not available in this environment",
        variant: "destructive",
      });
    }
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const togglePresentationMode = () => {
    setPresentationMode(!presentationMode);
    setShowDrawTools(false); // Hide draw tools when exiting presentation
    if (!presentationMode && !isFullscreen) {
      document.documentElement.requestFullscreen?.();
      setIsFullscreen(true);
    }
  };
  
  const toggleDrawTools = () => {
    setShowDrawTools(!showDrawTools);
  };
  
  // Drawing handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!presentationMode || !showDrawTools) return;
    setIsDrawing(true);
    
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const currentAnnotations = annotations.get(currentPage) || [];
    currentAnnotations.push({
      type: drawingMode,
      color: brushColor,
      size: brushSize,
      points: [{ x, y }]
    });
    setAnnotations(new Map(annotations.set(currentPage, currentAnnotations)));
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !presentationMode || !showDrawTools) return;
    
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const currentAnnotations = annotations.get(currentPage) || [];
    const lastAnnotation = currentAnnotations[currentAnnotations.length - 1];
    if (lastAnnotation) {
      lastAnnotation.points.push({ x, y });
      setAnnotations(new Map(annotations.set(currentPage, currentAnnotations)));
      
      // Draw on canvas
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.globalCompositeOperation = drawingMode === 'eraser' ? 'destination-out' : 'source-over';
        ctx.strokeStyle = drawingMode === 'highlighter' ? `${brushColor}80` : brushColor;
        ctx.lineWidth = brushSize * (drawingMode === 'highlighter' ? 3 : 1);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        const points = lastAnnotation.points;
        if (points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(points[points.length - 2].x, points[points.length - 2].y);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      }
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearAnnotations = () => {
    annotations.delete(currentPage);
    setAnnotations(new Map(annotations));
    
    // Re-render the page to clear drawings
    renderPage(currentPage);
  };

  const clearAllAnnotations = () => {
    setAnnotations(new Map());
    
    // Re-render all visible pages
    visiblePages.forEach(pageNum => {
      renderPage(pageNum);
    });
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

  const handleDownload = async () => {
    if (!fileUrl || !id) return;
    
    try {
      // Create download link using the data URL
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Download Complete",
        description: `${fileName} downloaded successfully`,
      });
    } catch (error) {
      console.error('Download failed:', error);
      toast({
        title: "Download Failed",
        description: "Failed to download the PDF file",
        variant: "destructive",
      });
    }
  };

  const handleGoBack = () => {
    navigate('/dashboard');
  };

  const handleGoHome = () => {
    navigate('/');
  };

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6 animate-in fade-in-0 duration-200">
          <div className="rounded-full bg-destructive/10 p-4 w-16 h-16 mx-auto mb-4">
            <FileText className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Unable to load PDF</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={handleGoBack} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Files
            </Button>
            <Button onClick={handleGoHome}>
              <Home className="w-4 h-4 mr-2" />
              Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "min-h-screen flex flex-col transition-colors duration-150",
      "bg-background"
    )}>
      {/* Clean Modern Header */}
      <header className={cn(
        "border-b sticky top-0 z-50 transition-colors duration-150",
        "bg-card border-border"
      )}>
        <div className="px-4 py-2.5">
          <div className="flex items-center justify-between">
            {/* Left: Back + Filename */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <TooltipProvider>
                <Tooltip delayDuration={500}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleGoBack}
                      className="h-9 w-9 p-0"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Back to files</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FileText className="w-5 h-5 flex-shrink-0 text-primary" />
                <div className="flex-1 min-w-0">
                  <h1 className="text-base font-medium truncate text-foreground">
                    {fileName}
                  </h1>
                  {totalPages > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {totalPages} pages • PDF Document
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-1">
              {!presentationMode && (
                <TooltipProvider>
                  <Tooltip delayDuration={500}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={toggleSidebar}
                        className="h-9 w-9 p-0"
                      >
                        {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>{sidebarOpen ? 'Hide' : 'Show'} page thumbnails</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              <TooltipProvider>
                <Tooltip delayDuration={500}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={togglePresentationMode}
                      className={cn(
                        "h-9 w-9 p-0 hover:bg-gray-700",
                        presentationMode && "bg-blue-600 hover:bg-blue-700"
                      )}
                    >
                      <Presentation className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Presentation mode with drawing tools</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {presentationMode && (
                <TooltipProvider>
                  <Tooltip delayDuration={500}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={toggleDrawTools}
                        className={cn(
                          "h-9 px-2.5 gap-1.5 hover:bg-gray-700",
                          showDrawTools && "bg-green-600 hover:bg-green-700"
                        )}
                      >
                        <Highlighter className="w-4 h-4" />
                        <span className="text-sm">Draw</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Toggle drawing tools</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>

          {/* Compact Toolbar */}
          {!presentationMode && (
            <div className="flex items-center justify-between gap-3 mt-2 pt-2 border-t border-border">
              {/* Left: Page Navigation */}
              <div className="flex items-center gap-1.5">
                <TooltipProvider>
                  <Tooltip delayDuration={500}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handlePreviousPage}
                        disabled={currentPage <= 1 || loading}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Previous page</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    value={currentPage}
                    onChange={(e) => {
                      const page = parseInt(e.target.value);
                      if (page >= 1 && page <= totalPages) {
                        setCurrentPage(page);
                        scrollToPage(page);
                      }
                    }}
                    className="w-14 h-8 text-center text-sm px-1"
                    min={1}
                    max={totalPages}
                  />
                  <span className="text-sm text-muted-foreground">/ {totalPages}</span>
                </div>
              
                <TooltipProvider>
                  <Tooltip delayDuration={500}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleNextPage}
                        disabled={currentPage >= totalPages || loading}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Next page</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

            {/* Center: Zoom Controls */}
            <div className="flex items-center gap-1">
              <TooltipProvider>
                <Tooltip delayDuration={500}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleZoomOut}
                      disabled={loading}
                      className="h-8 w-8 p-0"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Zoom out</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <span className="text-sm min-w-[50px] text-center font-medium text-muted-foreground">
                {Math.round(scale * 100)}%
              </span>
              
              <TooltipProvider>
                <Tooltip delayDuration={500}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleZoomIn}
                      disabled={loading}
                      className="h-8 w-8 p-0"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Zoom in</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip delayDuration={500}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleFitToWidth}
                      className="h-8 px-2 text-xs"
                    >
                      <Layers className="w-3.5 h-3.5 mr-1" />
                      Fit
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Fit to width</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip delayDuration={500}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRotate}
                      disabled={loading}
                      className="h-8 w-8 p-0"
                    >
                      <RotateCw className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Rotate clockwise</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Right: Search & Actions */}
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1">
                <Input
                  placeholder="Search in PDF..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-36 h-8 text-sm"
                />
                <TooltipProvider>
                  <Tooltip delayDuration={500}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSearch}
                        disabled={!searchTerm.trim() || loading}
                        className="h-8 w-8 p-0"
                      >
                        <Search className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Search (Ctrl+F)</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <TooltipProvider>
                <Tooltip delayDuration={500}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDownload}
                      disabled={loading}
                      className="h-8 w-8 p-0"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Download PDF</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <TooltipProvider>
                <Tooltip delayDuration={500}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePrint}
                      disabled={loading}
                      className="h-8 w-8 p-0"
                    >
                      <Printer className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Print (Ctrl+P)</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          )}

          {/* Search Results Banner */}
          {searchResults.length > 0 && !presentationMode && (
            <div className="mt-2 p-2 rounded-lg text-sm border bg-primary/10 border-primary/30 text-primary">
              Found {searchResults.length} result(s) - 
              <button 
                onClick={() => setSearchResults([])}
                className="ml-2 underline hover:no-underline"
              >
                Clear
              </button>
            </div>
          )}

          {/* Drawing Tools Panel - Presentation Mode */}
          {presentationMode && showDrawTools && (
            <div className="mt-2 p-3 rounded-lg border bg-card/50 border-border animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-4 flex-wrap">
                {/* Drawing Mode */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-card-foreground">Mode:</span>
                  <div className="flex gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDrawingMode('pen')}
                            className={cn(
                              "h-8 w-8 p-0",
                              drawingMode === 'pen' ? "bg-primary text-primary-foreground" : ""
                            )}
                          >
                            <Type className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Pen</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDrawingMode('highlighter')}
                            className={cn(
                              "h-8 w-8 p-0",
                              drawingMode === 'highlighter' ? "bg-primary text-primary-foreground" : ""
                            )}
                          >
                            <Highlighter className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Highlighter</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDrawingMode('eraser')}
                            className={cn(
                              "h-8 w-8 p-0",
                              drawingMode === 'eraser' ? "bg-destructive text-destructive-foreground" : ""
                            )}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Eraser</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                {/* Color Picker */}
                {drawingMode !== 'eraser' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-card-foreground">Color:</span>
                    <div className="flex gap-1">
                      {['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'].map((color) => (
                        <button
                          key={color}
                          onClick={() => setBrushColor(color)}
                          className={cn(
                            "w-7 h-7 rounded-full border-2 transition-all",
                            brushColor === color ? "border-primary scale-110" : "border-border hover:border-ring"
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Brush Size */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-card-foreground">Size:</span>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={brushSize}
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                    className="w-24 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <span className="text-xs text-muted-foreground w-8">{brushSize}px</span>
                </div>

                {/* Clear Actions */}
                <div className="flex items-center gap-1 ml-auto">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearAnnotations}
                          className="h-8 px-2 text-xs"
                        >
                          Clear Page
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Clear annotations on current page</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearAllAnnotations}
                          className="h-8 px-2 text-xs hover:bg-destructive hover:text-destructive-foreground"
                        >
                          Clear All
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Clear all annotations</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content with Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Page Thumbnails */}
        {sidebarOpen && !presentationMode && (
          <aside className="w-56 border-r overflow-y-auto transition-colors duration-150 bg-card border-border">
            <div className="p-2">
              <h3 className="text-xs font-semibold uppercase mb-2 px-2 text-muted-foreground">
                Pages ({totalPages})
              </h3>
              <ScrollArea className="h-[calc(100vh-12rem)]">
                <div className="space-y-2">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      onClick={() => {
                        setCurrentPage(pageNum);
                        scrollToPage(pageNum);
                      }}
                      className={cn(
                        "w-full p-2 rounded-lg border-2 transition-all duration-150 group",
                        currentPage === pageNum
                          ? "border-primary bg-primary/10" 
                          : "border-border hover:border-ring hover:bg-muted/50"
                      )}
                    >
                      <div className="aspect-[8.5/11] bg-background rounded overflow-hidden shadow-sm mb-1">
                        {thumbnails.get(pageNum) ? (
                          <img
                            src={thumbnails.get(pageNum)}
                            alt={`Page ${pageNum}`}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted">
                            <FileText className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <p className={cn(
                        "text-xs text-center font-medium",
                        currentPage === pageNum ? "text-primary" : "text-muted-foreground"
                      )}>
                        {pageNum}
                      </p>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </aside>
        )}

        {/* Main PDF Viewer */}
        <main 
          ref={containerRef}
          className="flex-1 overflow-auto transition-colors duration-150 bg-muted/30"
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full">
              <AppleLoader size="large" />
              <p className="mt-4 text-sm text-muted-foreground">
                Loading PDF with AI enhancement...
              </p>
            </div>
          ) : pdf ? (
            <div className="py-8 px-4 max-w-screen-2xl mx-auto">
              {viewMode === 'continuous' ? (
                // Continuous scroll mode
                <div className="space-y-8">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                    <div
                      key={pageNum}
                      id={`pdf-page-${pageNum}`}
                      className="flex flex-col items-center relative"
                    >
                      <canvas
                        ref={(el) => {
                          if (el) canvasRefs.current.set(pageNum, el);
                        }}
                        onMouseDown={(e) => {
                          if (presentationMode && showDrawTools) {
                            startDrawing(e);
                          }
                        }}
                        onMouseMove={(e) => {
                          if (presentationMode && showDrawTools && isDrawing) {
                            draw(e);
                          }
                        }}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        className={cn(
                          "shadow-2xl rounded-lg border border-gray-700 transition-all duration-150",
                          renderingPages.has(pageNum) && "opacity-50",
                          presentationMode && showDrawTools && "cursor-crosshair"
                        )}
                        style={{
                          maxWidth: '100%',
                          height: 'auto',
                        }}
                      />
                      {renderingPages.has(pageNum) && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <AppleLoader size="small" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                // Single page mode
                <div className="flex items-center justify-center min-h-full">
                  <canvas
                    ref={(el) => {
                      if (el) canvasRefs.current.set(currentPage, el);
                    }}
                    onMouseDown={(e) => {
                      if (presentationMode && showDrawTools) {
                        startDrawing(e);
                      }
                    }}
                    onMouseMove={(e) => {
                      if (presentationMode && showDrawTools && isDrawing) {
                        draw(e);
                      }
                    }}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    className={cn(
                      "shadow-2xl rounded-lg border border-gray-700",
                      presentationMode && showDrawTools && "cursor-crosshair"
                    )}
                    style={{
                      maxWidth: '100%',
                      height: 'auto',
                    }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="rounded-full bg-destructive/10 p-4 mb-4">
                <FileText className="w-8 h-8 text-destructive" />
              </div>
              <p className="text-sm mb-4 text-gray-400">
                Failed to load PDF document
              </p>
              <Button onClick={handleGoBack}>
                Return to Files
              </Button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default PDFViewerPage;
