import React from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import {
  Download,
  Share2,
  Info,
  Eye,
  Copy,
  Move,
  Edit,
  Star,
  Archive,
  Trash2,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  File as FileIcon,
} from '@/lib/icon-map';
import { formatFileSize, cn } from '@/lib/utils';
import type { FileItem } from '@/lib/api';

interface MobileFileActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  file: FileItem | null;
  onView?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  onInfo?: () => void;
  onCopy?: () => void;
  onMove?: () => void;
  onRename?: () => void;
  onFavorite?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  isFavorited?: boolean;
  isEncrypted?: boolean;
}

const getFileIcon = (fileType: string) => {
  if (fileType?.startsWith('image/')) return ImageIcon;
  if (fileType?.startsWith('video/')) return Video;
  if (fileType?.startsWith('audio/')) return Music;
  if (fileType?.startsWith('text/')) return FileText;
  return FileIcon;
};

const MobileFileActionSheet: React.FC<MobileFileActionSheetProps> = ({
  isOpen,
  onClose,
  file,
  onView,
  onDownload,
  onShare,
  onInfo,
  onCopy,
  onMove,
  onRename,
  onFavorite,
  onArchive,
  onDelete,
  isFavorited = false,
  isEncrypted = false,
}) => {
  if (!file) return null;

  const FileIconComponent = getFileIcon(file.type);

  const handleAction = (action: (() => void) | undefined) => {
    if (action) {
      action();
      onClose();
    }
    if ('vibrate' in navigator) {
      navigator.vibrate(30);
    }
  };

  const primaryActions = [
    { icon: Eye, label: 'Preview', onClick: onView, show: !!onView },
    { icon: Download, label: 'Download', onClick: onDownload, show: !!onDownload },
    { icon: Share2, label: 'Share', onClick: onShare, show: !!onShare },
  ];

  const secondaryActions = [
    { icon: Info, label: 'Details', onClick: onInfo, show: !!onInfo },
    { icon: Copy, label: 'Make a copy', onClick: onCopy, show: !!onCopy },
    { icon: Move, label: 'Move', onClick: onMove, show: !!onMove },
    { icon: Edit, label: 'Rename', onClick: onRename, show: !!onRename },
    { icon: Star, label: isFavorited ? 'Remove favorite' : 'Add favorite', onClick: onFavorite, show: !!onFavorite },
    { icon: Archive, label: 'Archive', onClick: onArchive, show: !!onArchive },
  ];

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent 
        side="bottom" 
        className={cn(
          "max-w-full w-full rounded-t-3xl",
          "bg-[#0d1117]/95 backdrop-blur-2xl border-t border-blue-500/20",
          "px-0 pt-3 shadow-2xl"
        )}
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 2rem)' }}
      >
        {/* Handle indicator */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-blue-500/30" />

        {/* File Info Header */}
        <div className="px-5 pb-4">
          <div className="flex items-center gap-3.5">
            <div className={cn(
              "flex h-12 w-12 items-center justify-center rounded-2xl",
              "bg-blue-500/10"
            )}>
              <FileIconComponent className="h-5 w-5 text-blue-300/70" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-blue-50">
                {file.name}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-blue-200/50">
                  {formatFileSize(file.size)}
                </span>
                {isEncrypted && (
                  <span className="text-xs text-blue-400">· Encrypted</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-blue-500/20 mx-5 mb-4" />

        {/* Primary Actions - Grid */}
        {primaryActions.some((a) => a.show) && (
          <>
            <div className="grid grid-cols-3 gap-2 px-4 pb-4">
              {primaryActions
                .filter((action) => action.show)
                .map((action) => (
                  <button
                    key={action.label}
                    onClick={() => handleAction(action.onClick)}
                    className={cn(
                      "flex flex-col items-center gap-2 py-4 rounded-2xl",
                      "bg-blue-500/10 hover:bg-blue-500/15",
                      "transition-all duration-150 active:scale-95"
                    )}
                  >
                    <action.icon className="h-5 w-5 text-blue-300/80" strokeWidth={1.75} />
                    <span className="text-xs font-medium text-blue-100/80">{action.label}</span>
                  </button>
                ))}
            </div>
            <div className="h-px bg-blue-500/20 mx-5 mb-3" />
          </>
        )}

        {/* Secondary Actions - List */}
        <div className="space-y-0.5 px-3">
          {secondaryActions
            .filter((action) => action.show)
            .map((action) => (
              <button
                key={action.label}
                onClick={() => handleAction(action.onClick)}
                className={cn(
                  "w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl",
                  "text-blue-100/90 hover:bg-blue-500/10",
                  "transition-all duration-150 active:scale-[0.98]"
                )}
              >
                <action.icon className="h-[18px] w-[18px] text-blue-300/50" strokeWidth={1.75} />
                <span className="text-sm font-medium">{action.label}</span>
              </button>
            ))}
        </div>

        {/* Delete Action */}
        {onDelete && (
          <>
            <div className="h-px bg-blue-500/20 mx-5 my-2" />
            <div className="px-3 pb-2">
              <button
                onClick={() => handleAction(onDelete)}
                className={cn(
                  "w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl",
                  "text-red-400 hover:text-red-300 hover:bg-red-500/15",
                  "transition-all duration-150 active:scale-[0.98]"
                )}
              >
                <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
                <span className="text-sm font-medium">Delete</span>
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default MobileFileActionSheet;
