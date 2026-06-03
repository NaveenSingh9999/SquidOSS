import React, { useState, useEffect, useRef } from 'react';
import pdfjsLib from '@/lib/pdfjs-config';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  Search,
  X,
  RotateCw,
  Maximize2,
  Minimize2
} from '@/lib/icon-map';

interface PDFViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  fileName: string;
  onDownload?: () => void;
}

const PDFViewerModal: React.FC<PDFViewerModalProps> = ({
  isOpen,
  onClose,
  fileUrl,
  fileName,
  onDownload
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { toast } = useToast();

  // Load PDF document
  useEffect(() => {
    if (!isOpen || !fileUrl) return;

    const loadPDF = async () => {
      try {
        setLoading(true);
        
        // Simple PDF.js loading - no authentication needed for blob/data URLs
        const loadingTask = pdfjsLib.getDocument({
          url: fileUrl,
          cMapUrl: '/pdfjs/cmaps/',
          cMapPacked: true,
        });
        
        const pdfDoc = await loadingTask.promise;
        setPdf(pdfDoc);
        setTotalPages(pdfDoc.numPages);
        // Page will be rendered by the separate useEffect that watches for pdf, currentPage changes
      } catch (err) {
        console.error('Error loading PDF:', err);
        toast({
          title: "PDF Loading Error",
          description: "Failed to load PDF. Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    loadPDF();
  }, [isOpen, fileUrl, toast]);

  // Cleanup blob URLs when modal closes
  useEffect(() => {
    if (!isOpen && fileUrl) {
      // Dynamic import to avoid circular dependencies
      import('@/services/pdfSecurity').then(({ PDFSecurityService }) => {
        PDFSecurityService.cleanupPDFUrl(fileUrl);
      });
    }
  }, [isOpen, fileUrl]);

  // Render current page
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;

    const renderPage = async () => {
      try {
        const page = await pdf.getPage(currentPage);
        const canvas = canvasRef.current!;
        const context = canvas.getContext('2d')!;

        // Calculate viewport
        const viewport = page.getViewport({ scale, rotation });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Clear canvas with dark background
        context.fillStyle = '#1a1a1a';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Render page
        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          canvas: canvas
        };

        await page.render(renderContext).promise;
        console.log(`Rendered page ${currentPage} of ${totalPages}`);
      } catch (error) {
        console.error('Error rendering page:', error);
        toast({
          title: "Rendering Error",
          description: `Failed to render page ${currentPage}`,
          variant: "destructive",
        });
      }
    };

    renderPage();
  }, [pdf, currentPage, scale, rotation, toast, totalPages]);

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handleZoomIn = () => {
    setScale(prevScale => Math.min(prevScale * 1.2, 3.0));
  };

  const handleZoomOut = () => {
    setScale(prevScale => Math.max(prevScale / 1.2, 0.5));
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

  const handleSearch = () => {
    if (!searchTerm.trim()) return;
    
    // Basic search implementation - could be enhanced
    toast({
      title: "Search",
      description: `Searching for "${searchTerm}" - Feature coming soon`,
    });
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const handleDownloadClick = () => {
    if (onDownload) {
      onDownload();
    } else {
      // Fallback download
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className={`${isFullscreen ? 'max-w-[100vw] max-h-[100vh] w-full h-full' : 'max-w-6xl max-h-[90vh]'} bg-background border-border`}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="bg-background/95 backdrop-blur border-b border-border p-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <span className="truncate max-w-md">{fileName}</span>
              {totalPages > 0 && (
                <span className="text-sm text-muted-foreground">
                  ({totalPages} pages)
                </span>
              )}
            </DialogTitle>
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleFullscreen}
                className="text-muted-foreground hover:text-foreground"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-2">
              {/* Navigation */}
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviousPage}
                disabled={currentPage <= 1 || loading}
                className="border-border"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={currentPage}
                  onChange={(e) => {
                    const page = parseInt(e.target.value);
                    if (page >= 1 && page <= totalPages) {
                      setCurrentPage(page);
                    }
                  }}
                  className="w-16 text-center border-border"
                  min={1}
                  max={totalPages}
                />
                <span className="text-sm text-muted-foreground">/ {totalPages}</span>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={currentPage >= totalPages || loading}
                className="border-border"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {/* Zoom Controls */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomOut}
                disabled={loading}
                className="border-border"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              
              <span className="text-sm text-muted-foreground min-w-[60px] text-center">
                {Math.round(scale * 100)}%
              </span>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomIn}
                disabled={loading}
                className="border-border"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>

              {/* Rotate */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRotate}
                disabled={loading}
                className="border-border"
              >
                <RotateCw className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="flex items-center gap-1">
                <Input
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-32 border-border"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSearch}
                  disabled={!searchTerm.trim() || loading}
                  className="border-border"
                >
                  <Search className="w-4 h-4" />
                </Button>
              </div>

              {/* Actions */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadClick}
                disabled={loading}
                className="border-border"
              >
                <Download className="w-4 h-4" />
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                disabled={loading}
                className="border-border"
              >
                <Printer className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* PDF Canvas Container */}
        <div 
          ref={containerRef}
          className="flex-1 overflow-auto bg-muted/20 p-4 min-h-[500px] flex items-center justify-center"
        >
          {loading ? (
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-muted-foreground">Loading PDF...</p>
            </div>
          ) : pdf ? (
            <canvas 
              ref={canvasRef}
              className="max-w-full max-h-full shadow-lg border border-border rounded-lg bg-white"
              style={{ 
                imageRendering: 'crisp-edges',
                filter: 'none' // Ensure no unwanted filters
              }}
            />
          ) : (
            <div className="text-center">
              <p className="text-muted-foreground">Failed to load PDF</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PDFViewerModal;
