
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileItem } from '@/lib/api';
import { X, Download, ChevronLeft, ChevronRight, Trash2, Info, MoreVertical } from '@/lib/icon-map';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface EnhancedFilePreviewProps {
  file: FileItem;
  open: boolean;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
  siblingFiles?: FileItem[];
  onDelete?: () => void;
  onDownload?: () => void;
  onViewInfo?: () => void;
  onPreview?: () => void;
}

const EnhancedFilePreview: React.FC<EnhancedFilePreviewProps> = ({
  file,
  open,
  onClose,
  onNext,
  onPrevious,
  hasNext = false,
  hasPrevious = false,
  siblingFiles = [],
  onDelete,
  onDownload,
  onViewInfo,
  onPreview
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      loadPreview();
    }
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [file, open]);

  const loadPreview = async () => {
    setIsLoading(true);
    setError(null);
    setLoadingProgress(10);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    try {
      const interval = setInterval(() => {
        setLoadingProgress(prev => {
          const nextProgress = prev + Math.random() * 15;
          return nextProgress > 95 ? 95 : nextProgress;
        });
      }, 300);

      await new Promise(resolve => setTimeout(resolve, 1500));
      
      clearInterval(interval);
      setLoadingProgress(100);
      
      let url = null;
      if (file.type.startsWith('image/')) {
        url = `https://placehold.co/800x600?text=${encodeURIComponent(file.name)}`;
      } else if (file.type.includes('pdf')) {
        url = `https://placehold.co/800x1000/gray/white?text=${encodeURIComponent('PDF Document: ' + file.name)}`;
      } else {
        url = `https://placehold.co/800x400/gray/white?text=${encodeURIComponent('File: ' + file.name)}`;
      }
      
      setPreviewUrl(url);
      setTimeout(() => setIsLoading(false), 200);
      
    } catch (err) {
      console.error("Error loading preview:", err);
      setError("Failed to load file preview");
      setIsLoading(false);
    }
  };

  const renderPreviewContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-full max-w-md mb-4">
            <div className="flex justify-between text-xs mb-2">
              <span>Decrypting and loading file...</span>
              <span>{Math.round(loadingProgress)}%</span>
            </div>
            <Progress value={loadingProgress} className="h-2" />
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={loadPreview}>Retry</Button>
        </div>
      );
    }

    if (!previewUrl) return null;

    if (file.type.startsWith('image/')) {
      return (
        <div className="flex items-center justify-center">
          <img 
            src={previewUrl} 
            alt={file.name} 
            className="max-w-full max-h-[70vh] object-contain" 
          />
        </div>
      );
    } else if (file.type.includes('pdf')) {
      return (
        <div className="flex items-center justify-center">
          <iframe 
            src={previewUrl} 
            title={file.name} 
            className="w-full h-[70vh]" 
            seamless
          />
        </div>
      );
    } else if (file.type.includes('text') || file.type.includes('json') || file.type.includes('javascript') || file.type.includes('html')) {
      return (
        <div className="overflow-auto bg-muted p-4 rounded-md max-h-[70vh]">
          <pre className="whitespace-pre-wrap">
            {`This is a text preview for ${file.name}`}
          </pre>
        </div>
      );
    } else {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <p className="mb-4">Preview not available for this file type</p>
          {onDownload && (
            <Button onClick={onDownload}>
              <Download className="mr-2 h-4 w-4" />
              Download to view
            </Button>
          )}
        </div>
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-[90vw] p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-10">
            <span className="truncate">{file.name}</span>
            <div className="flex items-center gap-2">
              {onDownload && (
                <Button variant="outline" size="sm" onClick={onDownload} className="h-8">
                  <Download className="h-4 w-4" />
                  <span className="sr-only">Download</span>
                </Button>
              )}
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                    <MoreVertical className="h-4 w-4" />
                    <span className="sr-only">More options</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onViewInfo && (
                    <DropdownMenuItem onClick={onViewInfo}>
                      <Info className="mr-2 h-4 w-4" />
                      View Info
                    </DropdownMenuItem>
                  )}
                  {onPreview && (
                    <DropdownMenuItem onClick={onPreview}>
                      <Download className="mr-2 h-4 w-4" />
                      Open in Viewer
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem onClick={onDelete} className="text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0" 
                onClick={onClose}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          {renderPreviewContent()}
        </div>
        
        {(onNext || onPrevious) && (
          <div className="flex justify-between mt-4">
            <Button 
              variant="outline" 
              onClick={onPrevious} 
              disabled={!hasPrevious}
              className={!hasPrevious ? 'opacity-0' : ''}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Previous
            </Button>
            <Button 
              variant="outline" 
              onClick={onNext} 
              disabled={!hasNext}
              className={!hasNext ? 'opacity-0' : ''}
            >
              Next
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EnhancedFilePreview;
