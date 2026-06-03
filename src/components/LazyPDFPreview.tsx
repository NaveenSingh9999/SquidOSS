import React, { useState, useEffect, useRef } from 'react';
import pdfjsLib from '@/lib/pdfjs-config';
import AppleLoader from '@/components/ui/AppleLoader';
import { cn } from '@/lib/utils';

interface LazyPDFPreviewProps {
  blobUrl: string;
  className?: string;
  maxPages?: number;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

export const LazyPDFPreview: React.FC<LazyPDFPreviewProps> = ({
  blobUrl,
  className,
  maxPages = 5,
  onLoad,
  onError
}) => {
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!blobUrl) return;

    const loadPDF = async () => {
      try {
        setLoading(true);
        
        const loadingTask = pdfjsLib.getDocument(blobUrl);
        const pdf = await loadingTask.promise;
        
        setTotalPages(pdf.numPages);
        const pagesToRender = Math.min(maxPages, pdf.numPages);
        const renderedPages: string[] = [];

        // Render pages with optimization
        for (let pageNum = 1; pageNum <= pagesToRender; pageNum++) {
          const page = await pdf.getPage(pageNum);
          
          // Calculate optimal scale for preview
          const viewport = page.getViewport({ scale: 1.0 });
          const containerWidth = containerRef.current?.clientWidth || 600;
          const scale = Math.min(containerWidth / viewport.width, 1.5);
          
          const scaledViewport = page.getViewport({ scale });
          
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d', {
            alpha: false,
            willReadFrequently: false
          });
          
          if (!context) continue;
          
          canvas.width = scaledViewport.width;
          canvas.height = scaledViewport.height;
          
          // High quality rendering
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = 'high';
          
          await page.render({
            canvasContext: context,
            viewport: scaledViewport,
            canvas: canvas
          }).promise;
          
          // Convert to data URL
          renderedPages.push(canvas.toDataURL('image/jpeg', 0.85));
        }
        
        setPages(renderedPages);
        onLoad?.();
      } catch (error) {
        console.error('Error loading PDF preview:', error);
        onError?.(error as Error);
      } finally {
        setLoading(false);
      }
    };

    loadPDF();
  }, [blobUrl, maxPages, onLoad, onError]);

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center min-h-[400px]", className)}>
        <AppleLoader size="large" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("space-y-4", className)}>
      {pages.map((pageUrl, index) => (
        <div key={index} className="relative">
          <img
            src={pageUrl}
            alt={`Page ${index + 1}`}
            className="w-full border border-border rounded-sm shadow-sm bg-background"
          />
          <div className="absolute top-2 right-2 bg-background/90 px-2 py-1 rounded text-xs text-muted-foreground border border-border">
            Page {index + 1}
          </div>
        </div>
      ))}
      {totalPages > maxPages && (
        <div className="text-center text-sm text-muted-foreground py-4">
          + {totalPages - maxPages} more pages
        </div>
      )}
    </div>
  );
};
