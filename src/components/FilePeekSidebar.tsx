import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Download, 
  Share2, 
  Trash2, 
  Info,
  Eye,
  Clock,
  Calendar,
  HardDrive,
  Lock,
  Globe,
  FileText,
  Image,
  Video,
  Music,
  Archive,
  Code,
  File,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Maximize2,
  Star
} from '@/lib/icon-map';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { FileItem as FileItemType, formatBytes } from '@/lib/api';

interface FilePeekSidebarProps {
  file: FileItemType | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenFullPreview?: () => void;
  onDownload?: (file: FileItemType) => void;
  onShare?: (file: FileItemType) => void;
  onDelete?: (file: FileItemType) => void;
  position?: 'left' | 'right';
  className?: string;
}

const getFileIcon = (file: FileItemType) => {
  const type = file.type?.toLowerCase() || '';
  const name = file.name?.toLowerCase() || '';

  if (type.startsWith('image/')) return <Image className="w-5 h-5 text-green-500" />;
  if (type.startsWith('video/')) return <Video className="w-5 h-5 text-red-500" />;
  if (type.startsWith('audio/')) return <Music className="w-5 h-5 text-purple-500" />;
  if (type.includes('pdf')) return <FileText className="w-5 h-5 text-red-400" />;
  if (name.match(/\.(zip|rar|7z|tar|gz)$/)) return <Archive className="w-5 h-5 text-orange-500" />;
  if (name.match(/\.(js|ts|jsx|tsx|py|java|c|cpp|go|rs|rb|php|html|css|json)$/)) {
    return <Code className="w-5 h-5 text-yellow-500" />;
  }
  return <File className="w-5 h-5 text-muted-foreground" />;
};

const getFileTypeLabel = (file: FileItemType): string => {
  const type = file.type?.toLowerCase() || '';
  const name = file.name?.toLowerCase() || '';

  if (type.startsWith('image/')) return 'Image';
  if (type.startsWith('video/')) return 'Video';
  if (type.startsWith('audio/')) return 'Audio';
  if (type.includes('pdf')) return 'PDF';
  if (name.match(/\.(zip|rar|7z|tar|gz)$/)) return 'Archive';
  if (name.match(/\.(js|ts|jsx|tsx|py|java|c|cpp|go|rs|rb|php|html|css|json)$/)) return 'Code';
  if (type.startsWith('text/')) return 'Text';
  return 'File';
};

export const FilePeekSidebar: React.FC<FilePeekSidebarProps> = ({
  file,
  isOpen,
  onClose,
  onOpenFullPreview,
  onDownload,
  onShare,
  onDelete,
  position = 'right',
  className,
}) => {
  const [width, setWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Handle resize
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = position === 'right' 
        ? startXRef.current - e.clientX 
        : e.clientX - startXRef.current;
      const newWidth = Math.max(280, Math.min(500, startWidthRef.current + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, position]);

  // Handle keyboard shortcut (Space to toggle)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Space when not in input/textarea
      if (e.key === ' ' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        // Don't prevent default here - let parent handle the toggle
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !file) return null;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <TooltipProvider>
      <div
        ref={sidebarRef}
        style={{ width }}
        className={cn(
          "fixed top-16 bottom-0 z-40",
          "bg-background/95 backdrop-blur-md",
          "border-l border-border/40",
          "flex flex-col",
          "shadow-xl",
          "transition-transform duration-200 ease-out",
          position === 'right' ? 'right-0' : 'left-0',
          isResizing && "select-none",
          className
        )}
      >
        {/* Resize handle */}
        <div
          onMouseDown={handleMouseDown}
          className={cn(
            "absolute top-0 bottom-0 w-1 cursor-col-resize group",
            "hover:bg-primary/20 transition-colors",
            position === 'right' ? 'left-0' : 'right-0'
          )}
        >
          <div className={cn(
            "absolute top-1/2 -translate-y-1/2 w-4 h-8 flex items-center justify-center",
            "opacity-0 group-hover:opacity-100 transition-opacity",
            position === 'right' ? '-left-1.5' : '-right-1.5'
          )}>
            <GripVertical className="w-3 h-3 text-muted-foreground" />
          </div>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between gap-2 p-3 border-b border-border/40">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 rounded-lg bg-primary/10">
              {getFileIcon(file)}
            </div>
            <div className="min-w-0">
              <h3 className="font-medium text-sm truncate" title={file.name}>
                {file.name}
              </h3>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{getFileTypeLabel(file)}</span>
                <span>•</span>
                <span>{formatBytes(file.size)}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            {onOpenFullPreview && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onOpenFullPreview}
                    className="h-8 w-8 p-0"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open full preview</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="h-8 w-8 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close (Esc)</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Preview area */}
        <div className="flex-1 overflow-y-auto">
          {/* Thumbnail/Preview */}
          <div className="p-4">
            <div className={cn(
              "aspect-video rounded-xl overflow-hidden",
              "bg-muted/50 border border-border/40",
              "flex items-center justify-center"
            )}>
              {file.type?.startsWith('image/') ? (
                <img
                  src={file.storage_path}
                  alt={file.name}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="text-center p-4">
                  {getFileIcon(file)}
                  <p className="text-xs text-muted-foreground mt-2">
                    Preview not available
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="px-4 pb-4">
            <div className="flex items-center gap-2">
              {onDownload && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDownload(file)}
                  className="flex-1 h-9 gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download
                </Button>
              )}
              {onShare && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onShare(file)}
                  className="flex-1 h-9 gap-2"
                >
                  <Share2 className="w-4 h-4" />
                  Share
                </Button>
              )}
            </div>
          </div>

          {/* File details */}
          <div className="px-4 pb-4 space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Details
            </h4>
            
            <div className="space-y-2">
              <DetailRow
                icon={<HardDrive className="w-4 h-4" />}
                label="Size"
                value={formatBytes(file.size)}
              />
              <DetailRow
                icon={<FileText className="w-4 h-4" />}
                label="Type"
                value={file.type || 'Unknown'}
              />
              <DetailRow
                icon={<Calendar className="w-4 h-4" />}
                label="Created"
                value={formatDate(file.created_at)}
              />
              <DetailRow
                icon={<Clock className="w-4 h-4" />}
                label="Modified"
                value={formatDate(file.updated_at)}
              />
              {file.parent_folder && (
                <DetailRow
                  icon={<FileText className="w-4 h-4" />}
                  label="Location"
                  value={file.parent_folder}
                />
              )}
            </div>
          </div>

          {/* Status badges */}
          <div className="px-4 pb-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Status
            </h4>
            <div className="flex flex-wrap gap-2">
              {file.encrypted && (
                <Badge variant="secondary" className="gap-1">
                  <Lock className="w-3 h-3" />
                  Encrypted
                </Badge>
              )}
              {file.shared && (
                <Badge variant="outline" className="gap-1">
                  <Share2 className="w-3 h-3" />
                  Shared
                </Badge>
              )}
              {file.is_public && (
                <Badge variant="secondary" className="gap-1 bg-green-500/10 text-green-600">
                  <Globe className="w-3 h-3" />
                  Public
                </Badge>
              )}
              {!file.encrypted && !file.shared && !file.is_public && (
                <Badge variant="outline" className="text-muted-foreground">
                  Private
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Footer with delete action */}
        {onDelete && (
          <div className="p-3 border-t border-border/40">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(file)}
              className="w-full h-9 gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-4 h-4" />
              Delete File
            </Button>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

// Helper component for detail rows
const DetailRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
}> = ({ icon, label, value }) => (
  <div className="flex items-center gap-2 text-sm">
    <span className="text-muted-foreground">{icon}</span>
    <span className="text-muted-foreground w-20 flex-shrink-0">{label}</span>
    <span className="truncate font-medium" title={value}>{value}</span>
  </div>
);

export default FilePeekSidebar;
