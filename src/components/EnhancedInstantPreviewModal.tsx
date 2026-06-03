import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Image as ImageIcon,
  Lock,
  Music,
  Share2,
  Video,
  X,
  Box,
} from '@/lib/icon-map';
import { cn, formatFileSize } from '@/lib/utils';
import { downloadFileWithRes54, downloadFilePreview } from '@/lib/res54';
import { ProgressiveVideoLoader } from '@/lib/videoStreamer';
import { useToast } from '@/hooks/use-toast';
import AppleLoader from '@/components/ui/AppleLoader';
import CBVideoPlayer from './cbVideoPlayer';
import MobileVideoPlayer from './MobileVideoPlayer';
import EnhancedTextEditor from './EnhancedTextEditor';
import AdvancedImageViewer from '@/components/AdvancedImageViewer';
import SpreadsheetViewer from '@/components/SpreadsheetViewer';
import { spreadsheetToCSV } from '@/lib/spreadsheet-utils';
import { useIsMobile } from '@/hooks/use-mobile';
import MobilePDFViewer from '@/components/MobilePDFViewer';
import OptimizedPDFViewer from '@/components/OptimizedPDFViewer';
import ModelViewer from '@/components/ModelViewer';
import FontPreviewer from '@/components/FontPreviewer';
import ArchiveViewerModal from '@/components/ArchiveViewerModal';
import { createFileShare } from '@/lib/api';

const CustomDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay className="z-[60] bg-black/60 opacity-0 data-[state=open]:opacity-100 transition-opacity duration-150 ease-out" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-[60] grid w-full max-w-6xl -translate-x-1/2 -translate-y-1/2 gap-0 overflow-hidden rounded-[24px] border border-border/40 bg-card shadow-2xl',
        'opacity-0 scale-[0.96] data-[state=open]:opacity-100 data-[state=open]:scale-100',
        'transition-[opacity,transform] duration-150 ease-out',
        className
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
));
CustomDialogContent.displayName = 'CustomDialogContent';

interface CarouselFile {
  id: string;
  name: string;
  type: string;
  size?: number;
}

interface EnhancedInstantPreviewModalProps {
  file: any;
  isOpen: boolean;
  onClose: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
  currentIndex?: number;
  totalFiles?: number;
  siblingFiles?: CarouselFile[];
  onNavigateToFile?: (file: CarouselFile) => void;
}

// ─── Type Registry ────────────────────────────────────────────────

interface PreviewHandler {
  match: (file: any) => boolean;
  label: string;
  icon: React.ReactNode;
}

const getFileTypeLabel = (file: any) => {
  if (!file) return 'File';
  if (file.type?.startsWith('image/')) return 'Image';
  if (file.type?.startsWith('video/')) return 'Video';
  if (file.type?.startsWith('audio/')) return 'Audio';
  if (file.type === 'application/pdf') return 'PDF';
  if (file.type?.includes('spreadsheet') || file.name?.match(/\.(xlsx?|csv|ods)$/i)) return 'Sheet';
  if (file.type?.startsWith('text/') || file.name?.match(/\.(txt|md|json|js|ts|tsx|jsx|html|css|yml|yaml)$/i)) return 'Text';
  if (file.name?.match(/\.(glb|gltf|stl|obj)$/i)) return '3D Model';
  if (file.name?.match(/\.(zip|rar|7z|tar\.gz|tgz)$/i)) return 'Archive';
  if (file.name?.match(/\.(ttf|otf|woff|woff2)$/i)) return 'Font';
  return 'File';
};

// ─── Component ────────────────────────────────────────────────────

const EnhancedInstantPreviewModal: React.FC<EnhancedInstantPreviewModalProps> = ({
  file,
  isOpen,
  onClose,
  onDownload,
  onShare,
  onNext,
  onPrevious,
  hasNext = false,
  hasPrevious = false,
  currentIndex,
  totalFiles,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decodedBlob, setDecodedBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [isPartialPreview, setIsPartialPreview] = useState(false);
  const [streamingProgress, setStreamingProgress] = useState<{ loaded: number; total: number } | null>(null);

  const touchStartY = useRef(0);
  const videoLoaderRef = useRef<ProgressiveVideoLoader | null>(null);
  const playbackPositionRef = useRef(0);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const loadGenRef = useRef(0);
  const revokeTimersRef = useRef<number[]>([]);

  const is3DModel = file?.name?.match(/\.(glb|gltf|stl|obj)$/i);
  const isArchive = file?.name?.match(/\.(zip|rar|7z|tar\.gz|tgz)$/i);
  const isFont = file?.name?.match(/\.(ttf|otf|woff|woff2)$/i);
  const isStreamingVideo = file?.type?.startsWith('video/') && file?.encrypted && file?.storage_path === 'res54_distributed';
  const canProgressiveLoad = !isArchive && !isStreamingVideo && (
    file?.type?.startsWith('text/') ||
    file?.type === 'application/json' ||
    file?.name?.match(/\.(txt|md|json|js|ts|tsx|jsx|py|html|css|scss|yml|yaml|xml|sql|log)$/i)
  );

  const handleClose = useCallback(() => {
    setDragOffset(0);
    onClose();
  }, [onClose]);

  // Track blob URL via ref to avoid stale closure captures in async callbacks
  const blobUrlRef = useRef<string | null>(null);
  useEffect(() => {
    blobUrlRef.current = blobUrl;
  }, [blobUrl]);
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      revokeTimersRef.current.forEach(id => window.clearTimeout(id));
      revokeTimersRef.current = [];
    };
  }, []);

  // Helper: revoke the blob URL tracked in the ref and create a new one
  const replaceBlobUrl = useCallback((blob: Blob) => {
    const prev = blobUrlRef.current;
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    return { url, prev };
  }, []);

  useEffect(() => {
    if (!isOpen || !file?.id) return;

    const fileId = file.id;
    const fileName = file.name || 'unknown';
    const gen = ++loadGenRef.current;
    console.log(`[PreviewEffect] START gen=${gen} fileId=${fileId} fileName=${fileName} type=${file?.type} isStreamingVideo=${isStreamingVideo} canProgressiveLoad=${canProgressiveLoad}`);

    // Archives don't need download-first for preview
    if (isArchive) {
      setLoading(false);
      return;
    }

    // Streaming video: progressive load with early playback
    if (isStreamingVideo) {
      console.log(`[PreviewEffect] Streaming video path for ${fileId}`);
      setLoading(true);
      setError(null);
      setStreamingProgress(null);

      const loader = new ProgressiveVideoLoader(file.id, file.type, file.size);
      videoLoaderRef.current = loader;

      loader.onEvent((event) => {
        if (loadGenRef.current !== gen) return;
        console.log(`[PreviewEffect] Streamer event: ${event.type} for ${fileId}`);
        if (event.type === 'partial') {
          setStreamingProgress({
            loaded: event.chunkCount,
            total: event.totalChunks,
          });
        } else if (event.type === 'complete') {
          setStreamingProgress(null);
          const { url } = replaceBlobUrl(event.blob);
          setBlobUrl(url);
          setDecodedBlob(null);
          setLoading(false);
        } else if (event.type === 'error') {
          console.error(`[PreviewEffect] Streamer error: ${event.message}`);
          setError(event.message);
          setLoading(false);
        }
      });

      loader.start();

      return () => {
        console.log(`[PreviewEffect] CLEANUP (streaming) gen=${gen}`);
        loader.destroy();
        videoLoaderRef.current = null;
      };
    }

    // Progressive load for text: show partial content quickly, full in background
    if (canProgressiveLoad) {
      console.log(`[PreviewEffect] Progressive text load for ${fileId}`);
      const loadProgressive = async () => {
        setLoading(true);
        setError(null);

        try {
          const preview = await downloadFilePreview(file.id, 3);

          if (loadGenRef.current !== gen) return;

          const partialBlob = preview.blob;
          const partialUrl = URL.createObjectURL(partialBlob);
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = partialUrl;

          setDecodedBlob(partialBlob);
          setBlobUrl(partialUrl);
          setIsPartialPreview(preview.isPartial);

          if (preview.isPartial) {
            downloadFileWithRes54(file.id, {
              reason: 'preview',
              fileName: file.name,
            }).then((fullBlob) => {
              if (loadGenRef.current !== gen) return;
              const fullUrl = URL.createObjectURL(fullBlob);
              if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
              blobUrlRef.current = fullUrl;
              setDecodedBlob(fullBlob);
              setBlobUrl(fullUrl);
              setIsPartialPreview(false);
            }).catch(() => {
              setIsPartialPreview(true);
            });
          }
        } catch (err: any) {
          if (loadGenRef.current !== gen) return;
          setIsPartialPreview(false);

          try {
            const blob = await downloadFileWithRes54(file.id, {
              reason: 'preview',
              fileName: file.name,
            });
            if (loadGenRef.current !== gen) return;
            const nextUrl = URL.createObjectURL(blob);
            if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = nextUrl;
            setDecodedBlob(blob);
            setBlobUrl(nextUrl);
          } catch (fallbackErr: any) {
            if (loadGenRef.current !== gen) return;
            setError(fallbackErr?.message || 'Unable to load preview');
          }
        } finally {
          if (loadGenRef.current === gen) setLoading(false);
        }
      };

      loadProgressive();
      return;
    }

    // Full download for all other file types
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        console.log(`[PreviewEffect] Full download starting gen=${gen} for ${fileId}`);
        const blob = await downloadFileWithRes54(file.id, {
          reason: 'preview',
          fileName: file.name,
        });
        console.log(`[PreviewEffect] Full download COMPLETED gen=${gen} for ${fileId}, blob size=${blob?.size}, type=${blob?.type}`);

        if (loadGenRef.current !== gen) return;

        const nextUrl = URL.createObjectURL(blob);
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = nextUrl;
        console.log(`[PreviewEffect] blobUrl created: ${nextUrl} for ${fileId}`);

        setDecodedBlob(blob);
        setBlobUrl(nextUrl);
      } catch (err: any) {
        console.error(`[PreviewEffect] Download FAILED gen=${gen}:`, err?.message, err);
        if (loadGenRef.current !== gen) return;
        setError(err?.message || 'Unable to load preview');
      } finally {
        if (loadGenRef.current === gen) {
          console.log(`[PreviewEffect] Setting loading=false gen=${gen} for ${fileId}`);
          setLoading(false);
        }
      }
    };

    const safetyTimer = setTimeout(() => {
      if (loadGenRef.current === gen) {
        console.warn(`[PreviewEffect] SAFETY TIMEOUT gen=${gen} for ${fileId} — forcing loading=false`);
        setLoading(false);
      }
    }, 30000);

    load();

    return () => {
      console.log(`[PreviewEffect] CLEANUP gen=${gen} for ${fileId}`);
      clearTimeout(safetyTimer);
    };
  }, [isOpen, file?.id, file?.name, loadGenRef]);

  const handleDownload = useCallback(async () => {
    if (onDownload) {
      onDownload();
      return;
    }

    if (!decodedBlob && file?.id) {
      try {
        const blob = await downloadFileWithRes54(file.id, {
          reason: 'download',
          fileName: file.name,
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err: any) {
        toast({
          title: 'Download failed',
          description: err?.message || 'Unable to download file',
          variant: 'destructive',
        });
      }
      return;
    }

    if (!decodedBlob || !file?.name) return;

    const downloadUrl = URL.createObjectURL(decodedBlob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  }, [decodedBlob, file?.name, file?.id, onDownload, toast]);

  const handleShare = useCallback(async () => {
    if (onShare) {
      await onShare();
      return;
    }

    try {
      const { shareUrl } = await createFileShare(file.id);
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: 'Share Link Copied',
        description: 'The share link has been copied to your clipboard.',
      });
    } catch (error: any) {
      toast({
        title: 'Share failed',
        description: error?.message || 'Unable to create a share link right now.',
        variant: 'destructive',
      });
    }
  }, [file?.id, onShare, toast]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const diffY = e.touches[0].clientY - touchStartY.current;
    if (diffY > 0) setDragOffset(Math.min(diffY, 220));
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (dragOffset > 110) {
      handleClose();
    }
    setDragOffset(0);
  };

  if (!file) return null;

  const isImage = file.type?.startsWith('image/');
  const isVideo = file.type?.startsWith('video/');
  const isAudio = file.type?.startsWith('audio/');
  const isPDF = file.type === 'application/pdf';
  const isSpreadsheet =
    file.type?.includes('spreadsheet') ||
    file.type === 'text/csv' ||
    file.name?.match(/\.(xlsx?|csv|ods)$/i);
  const isText =
    file.type?.startsWith('text/') ||
    file.type === 'application/json' ||
    file.name?.match(/\.(txt|md|json|js|ts|tsx|jsx|py|html|css|scss|yml|yaml|xml|sql|log)$/i);

  const renderPreview = () => {
    console.log(`[PreviewRender] loading=${loading} error=${error?.slice(0,60)} blobUrl=${!!blobUrl} decodedBlob=${!!decodedBlob} isStreamingVideo=${isStreamingVideo}`);
    // Archive: open separate modal
    if (isArchive) {
      return (
        <div className="flex h-full min-h-[320px] items-center justify-center">
          <div className="text-center space-y-3">
            <Box className="h-10 w-10 mx-auto text-yellow-500" />
            <p className="text-sm font-medium">{file.name}</p>
            <Button onClick={() => setArchiveOpen(true)} variant="outline">
              Browse Archive Contents
            </Button>
            <ArchiveViewerModal
              open={archiveOpen}
              onClose={() => setArchiveOpen(false)}
              file={{ id: file.id, name: file.name, url: blobUrl || undefined }}
              onDownload={() => handleDownload()}
            />
          </div>
        </div>
      );
    }

    if (loading && isStreamingVideo) {
      return (
        <div className="flex h-full min-h-[320px] items-center justify-center bg-black">
          <div className="space-y-3 text-center">
            <AppleLoader size="large" />
            <p className="text-sm text-white/70">
              {streamingProgress
                ? `Loading video... ${streamingProgress.loaded}/${streamingProgress.total} chunks`
                : 'Preparing video...'}
            </p>
          </div>
        </div>
      );
    }

    if (isStreamingVideo && blobUrl) {
      return (
        <div className="h-full bg-black">
          <CBVideoPlayer
            file={file}
            src={blobUrl}
            autoPlay
            muted={false}
            useStreaming={false}
            onDownload={handleDownload}
            onShare={handleShare}
            className="h-full w-full"
          />
        </div>
      );
    }

    if (loading) {
      return (
        <div className="flex h-full min-h-[320px] items-center justify-center">
          <div className="space-y-3 text-center">
            <AppleLoader size="large" />
            <p className="text-sm text-muted-foreground">Loading preview...</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex h-full min-h-[320px] items-center justify-center px-6">
          <div className="space-y-3 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[16px] bg-destructive/10 text-destructive">
              <AlertCircle className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium">Unable to load preview</p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        </div>
      );
    }

    if (!decodedBlob || !blobUrl) {
      return (
        <div className="flex h-full min-h-[320px] items-center justify-center text-muted-foreground">
          <FileText className="h-5 w-5" />
        </div>
      );
    }

    // 3D Model
    if (is3DModel) {
      return <ModelViewer src={blobUrl} fileName={file.name} fileType={file.type} />;
    }

    // Font
    if (isFont) {
      return <FontPreviewer src={blobUrl} fileName={file.name} />;
    }

    if (isPDF) {
      if (isMobile) {
        return (
          <MobilePDFViewer
            file={file}
            pdfBlob={decodedBlob}
            onClose={handleClose}
            onDownload={handleDownload}
            onShare={handleShare}
          />
        );
      }

      return (
        <OptimizedPDFViewer
          file={file}
          blobUrl={blobUrl}
          pdfBlob={decodedBlob}
          onClose={handleClose}
          onDownload={handleDownload}
        />
      );
    }

    if (isImage) {
      return (
        <AdvancedImageViewer
          src={blobUrl}
          alt={file.name}
          file={{ name: file.name, size: file.size, type: file.type }}
          onDownload={handleDownload}
          onShare={handleShare}
        />
      );
    }

    if (isVideo) {
      if (isMobile) {
        return (
          <div className="h-full bg-black">
            <MobileVideoPlayer file={file} blobUrl={blobUrl} onClose={handleClose} />
          </div>
        );
      }

      return (
        <div className="h-full bg-black">
          <CBVideoPlayer
            file={file}
            src={blobUrl}
            autoPlay={false}
            muted={false}
            onDownload={handleDownload}
            onShare={handleShare}
            className="h-full w-full"
          />
        </div>
      );
    }

    if (isAudio) {
      return (
        <div className="p-6">
          <audio controls className="w-full" preload="metadata">
            <source src={blobUrl} type={file.type} />
            Your browser does not support audio playback.
          </audio>
        </div>
      );
    }

    if (isSpreadsheet) {
      return (
        <SpreadsheetViewer
          src={blobUrl}
          fileName={file.name}
          onDownload={handleDownload}
          onSave={async (data) => {
            try {
              const csvContent = spreadsheetToCSV(data);
              const nextBlob = new Blob([csvContent], { type: 'text/csv' });
              const nextUrl = URL.createObjectURL(nextBlob);
              const a = document.createElement('a');
              a.href = nextUrl;
              a.download = `modified_${file.name}`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(nextUrl);
            } catch (saveError) {
              console.error(saveError);
            }
          }}
        />
      );
    }

    if (isText) {
      return (
        <div className="relative h-full">
          {isPartialPreview && (
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/40 bg-card/95 px-4 py-2 text-xs text-muted-foreground">
              <div className="h-1 w-1 animate-pulse rounded-full bg-blue-500" />
              Loading full file in background...
            </div>
          )}
          <EnhancedTextEditor
            file={file}
            decodedBlob={decodedBlob}
            onSave={async () => {}}
            onDownload={handleDownload}
            onShare={handleShare}
            readonly={false}
          />
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-[320px] items-center justify-center px-6 text-center">
        <div className="space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[16px] bg-muted text-muted-foreground">
            <FileText className="h-5 w-5" />
          </div>
          <p className="text-sm text-muted-foreground">Preview not available for this file type</p>
        </div>
      </div>
    );
  };

  // ─── Mobile Layout ────────────────────────────────────────────────

  if (isMobile) {
    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 z-[60]">
        <div className="absolute inset-0 bg-black/45" onClick={handleClose} />

        <div
          className="absolute inset-x-0 bottom-0 mt-auto flex h-[94vh] flex-col overflow-hidden border border-border/55 bg-card/95 shadow-[0_-20px_52px_rgba(2,6,23,0.32)]"
          style={{ transform: `translateY(${dragOffset}px)`, opacity: 1 - dragOffset / 420 }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <header className="border-b border-border/55 bg-card/95 px-3 pb-3 pt-[calc(env(safe-area-inset-top)+8px)]">
            <div className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-muted-foreground/35" />

            <div className="flex items-center gap-2.5">
              <Button variant="ghost" size="sm" onClick={handleClose} className="h-9 w-9 rounded-[12px] p-0">
                <ChevronLeft className="h-4.5 w-4.5" />
              </Button>

              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Instant Preview</p>
                <h2 className="truncate text-sm font-semibold text-foreground">{file.name}</h2>
              </div>

              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={handleShare} className="h-9 w-9 rounded-[12px] p-0">
                  <Share2 className="h-4 w-4" />
                </Button>
                {!isArchive && (
                  <Button variant="ghost" size="sm" onClick={handleDownload} className="h-9 w-9 rounded-[12px] p-0">
                    <Download className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={handleClose} className="h-9 w-9 rounded-[12px] p-0">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[11px] text-muted-foreground">
              <span className="inline-flex shrink-0 items-center rounded-full border border-border/60 bg-background/70 px-2.5 py-1">
                {getFileTypeLabel(file)}
              </span>
              <span className="inline-flex shrink-0 items-center rounded-full border border-border/60 bg-background/70 px-2.5 py-1">
                {formatFileSize(file.size)}
              </span>
              {typeof currentIndex === 'number' && typeof totalFiles === 'number' && totalFiles > 1 && (
                <span className="inline-flex shrink-0 items-center rounded-full border border-border/60 bg-background/70 px-2.5 py-1">
                  {currentIndex + 1}/{totalFiles}
                </span>
              )}
              {file.encrypted && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-600 dark:text-emerald-400">
                  <Lock className="h-3 w-3" />
                  Encrypted
                </span>
              )}
            </div>
          </header>

          <div className="relative flex-1 overflow-auto bg-background">{renderPreview()}</div>

          <footer className="border-t border-border/55 bg-card/95 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] pt-2.5">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => hasPrevious && onPrevious?.()}
                disabled={!hasPrevious}
                className={cn(
                  'inline-flex items-center justify-center gap-1 rounded-[12px] px-2.5 py-2.5 text-xs font-medium transition-all',
                  hasPrevious
                    ? 'border border-border/60 bg-background/75 text-foreground active:scale-[0.97]'
                    : 'border border-border/45 bg-background/50 text-muted-foreground/65'
                )}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>

              <button
                onClick={() => hasNext && onNext?.()}
                disabled={!hasNext}
                className={cn(
                  'inline-flex items-center justify-center gap-1 rounded-[12px] px-2.5 py-2.5 text-xs font-medium transition-all',
                  hasNext
                    ? 'border border-border/60 bg-background/75 text-foreground active:scale-[0.97]'
                    : 'border border-border/45 bg-background/50 text-muted-foreground/65'
                )}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={handleShare}
                className="inline-flex items-center justify-center gap-1 rounded-[12px] border border-border/60 bg-background/75 px-2.5 py-2.5 text-xs font-medium text-foreground transition-all active:scale-[0.97]"
              >
                <Share2 className="h-4 w-4" />
                Share Link
              </button>

              {!isArchive && (
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center justify-center gap-1 rounded-[12px] bg-primary px-2.5 py-2.5 text-xs font-medium text-primary-foreground transition-all active:scale-[0.97]"
                >
                  <Download className="h-4 w-4" />
                  Download
                </button>
              )}
            </div>
          </footer>
        </div>
      </div>
    );
  }

  // ─── Desktop Layout ────────────────────────────────────────────────

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <CustomDialogContent className="max-h-[90vh] w-[95vw] p-0">
        <DialogPrimitive.Title className="sr-only">
          Preview {file?.name || 'file'}
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">
          Instant preview for the selected file with download and sharing actions.
        </DialogPrimitive.Description>
        <header className="flex items-center justify-between gap-3 border-b border-border/40 bg-card/95 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="rounded-[12px] bg-primary/10 p-2 text-primary">
              {isImage && <ImageIcon className="h-4 w-4" />}
              {isVideo && <Video className="h-4 w-4" />}
              {isAudio && <Music className="h-4 w-4" />}
              {isPDF && <FileText className="h-4 w-4" />}
              {is3DModel && <Box className="h-4 w-4" />}
              {isArchive && <Box className="h-4 w-4" />}
              {!isImage && !isVideo && !isAudio && !isPDF && !is3DModel && !isArchive && <FileText className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">{file.name}</h2>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formatFileSize(file.size)}</span>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                <span>{getFileTypeLabel(file)}</span>
                {typeof currentIndex === 'number' && typeof totalFiles === 'number' && totalFiles > 1 && (
                  <>
                    <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                    <span>{currentIndex + 1}/{totalFiles}</span>
                  </>
                )}
                {file.encrypted && (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Lock className="h-3 w-3" />
                    Encrypted
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {hasPrevious && (
              <Button variant="ghost" size="sm" onClick={onPrevious} className="h-8 w-8 rounded-[10px] p-0">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            {hasNext && (
              <Button variant="ghost" size="sm" onClick={onNext} className="h-8 w-8 rounded-[10px] p-0">
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleShare} className="h-8 w-8 rounded-[10px] p-0">
              <Share2 className="h-4 w-4" />
            </Button>
            {!isArchive && (
              <Button variant="ghost" size="sm" onClick={handleDownload} className="h-8 w-8 rounded-[10px] p-0">
                <Download className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleClose} className="h-8 w-8 rounded-[10px] p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="h-[78vh] overflow-auto">{renderPreview()}</div>
      </CustomDialogContent>
    </Dialog>
  );
};

export default EnhancedInstantPreviewModal;
