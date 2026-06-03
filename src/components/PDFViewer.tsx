
import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import {
  ZoomIn,
  ZoomOut,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  RotateCw
} from '@/lib/icon-map';
import pdfjsLib from '@/lib/pdfjs-config';

interface PDFViewerProps {
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

const PDFViewer: React.FC<PDFViewerProps> = ({
  file,
  src,
  open,
  onClose,
  onDownload
}) => {
  // Return early if required props are missing
  if (!file?.name) {
    console.warn('PDFViewer: Missing required file prop or file.name');
    return null;
  }

  const [scale, setScale] = useState(1);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [rotation, setRotation] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Load PDF when src changes or component opens
  useEffect(() => {
    if (open && src) {
      loadPDF();
    }
  }, [open, src]);

  useEffect(() => {
    if (pdfDoc && pageNum) {
      renderPage();
    }
  }, [pdfDoc, pageNum, scale, rotation]);

  const loadPDF = async () => {
    try {
      setLoading(true);
      const loadingTask = pdfjsLib.getDocument({ url: src });
      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
      setPageNum(1);
    } catch (error) {
      console.error('Error loading PDF:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderPage = async () => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      const page = await pdfDoc.getPage(pageNum);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      const viewport = page.getViewport({ scale, rotation });
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        canvas: canvas
      };
      
      await page.render(renderContext).promise;
    } catch (error) {
      console.error('Error rendering page:', error);
    }
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev * 1.2, 3));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev / 1.2, 0.5));
  };

  const handlePrevPage = () => {
    if (pageNum > 1) {
      setPageNum(pageNum - 1);
    }
  };

  const handleNextPage = () => {
    if (pageNum < numPages) {
      setPageNum(pageNum + 1);
    }
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-4xl h-[90vh] flex flex-col p-0"
        aria-describedby="pdf-viewer-description"
      >
        <DialogHeader className="px-4 py-2">
          <DialogTitle>{file.name}</DialogTitle>
          <p id="pdf-viewer-description" className="text-sm text-muted-foreground">
            View and interact with your PDF document
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-hidden bg-gray-100 relative">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                <p>Loading PDF...</p>
              </div>
            </div>
          ) : (
            <div className="h-full overflow-auto flex justify-center items-start p-4">
              <canvas
                ref={canvasRef}
                className="border shadow-lg bg-white"
                style={{ maxWidth: '100%', height: 'auto' }}
              />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="border-t p-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevPage}
                disabled={pageNum <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <span className="text-sm min-w-20 text-center">
                {pageNum} / {numPages}
              </span>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={pageNum >= numPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomOut}
                disabled={scale <= 0.5}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              
              <span className="text-sm min-w-16 text-center">
                {Math.round(scale * 100)}%
              </span>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomIn}
                disabled={scale >= 3}
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
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PDFViewer;
