import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Eye, Download, Share2, Info, Trash2, Archive, Star, Palette, Check, FolderOpen } from '@/lib/icon-map';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useBookmarks, FILE_COLORS } from '@/hooks/use-bookmarks';
import { createFileShare } from '@/lib/api';

interface UniversalContextMenuProps {
  x: number;
  y: number;
  item: any;
  onClose: () => void;
  onView?: () => void;
  onInfo?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  onDownload?: () => void;
  onExtract?: () => void;
  onViewArchive?: () => void;
  onBookmarkChange?: (bookmarked: boolean) => void;
  onColorChange?: (color: string) => void;
}

const UniversalContextMenu: React.FC<UniversalContextMenuProps> = ({
  x,
  y,
  item,
  onClose,
  onView,
  onInfo,
  onShare,
  onDelete,
  onDownload,
  onExtract,
  onViewArchive,
  onBookmarkChange,
  onColorChange,
}) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { isBookmarked, toggleBookmark, getColor, setColor } = useBookmarks();
  const [showColorPicker, setShowColorPicker] = useState(false);
  const itemBookmarked = isBookmarked(item?.id);
  const itemColor = getColor(item?.id);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.fixed')) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleView = () => {
    if (onView) {
      onView();
    }
    onClose();
  };

  const handleInfo = () => {
    if (onInfo) {
      onInfo();
    }
    onClose();
  };

  const handleDownload = () => {
    if (onDownload) {
      onDownload();
    }
    onClose();
  };

  const handleExtract = () => {
    if (onExtract) {
      onExtract();
    }
    onClose();
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete();
    }
    onClose();
  };

  const handleShare = async () => {
    if (onShare) {
      await onShare();
      onClose();
      return;
    }

    if (!item?.id) {
      onClose();
      return;
    }

    try {
      const { shareUrl } = await createFileShare(item.id);
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: "Share Link Copied",
        description: "The share link has been copied to your clipboard.",
      });
    } catch (error: any) {
      console.error('Failed to create/copy share link:', error);
      toast({
        title: "Share failed",
        description: error?.message || "Unable to create a share link right now.",
        variant: "destructive",
      });
    }

    onClose();
  };

  const handleToggleBookmark = () => {
    if (!item) return;
    const wasBookmarked = toggleBookmark({
      id: item.id,
      name: item.name,
      type: item.type?.includes('folder') ? 'folder' : 'file',
      path: item.folder || item.path,
    });
    toast({
      title: wasBookmarked ? "Added to Favorites" : "Removed from Favorites",
      description: wasBookmarked 
        ? `${item.name} has been bookmarked.`
        : `${item.name} has been removed from favorites.`,
    });
    onBookmarkChange?.(wasBookmarked);
    onClose();
  };

  const handleSetColor = (color: string) => {
    if (!item) return;
    setColor(item.id, color);
    toast({
      title: color ? "Color Applied" : "Color Removed",
      description: color 
        ? `Color tag applied to ${item.name}.`
        : `Color tag removed from ${item.name}.`,
    });
    onColorChange?.(color);
    setShowColorPicker(false);
    onClose();
  };

  return (
    <div
      className={cn(
        "fixed rounded-2xl shadow-2xl py-2 z-50 min-w-[180px] animate-scale-in overflow-hidden",
        isMobile 
          ? "bg-[#0d1117]/95 backdrop-blur-2xl border border-blue-500/20 shadow-blue-900/20" 
          : "bg-background border border-border"
      )}
      style={{
        left: `${Math.min(x, window.innerWidth - 200)}px`,
        top: `${Math.min(y, window.innerHeight - 250)}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {onView && (
        <button
          onClick={handleView}
          className={cn(
            "w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors",
            isMobile 
              ? "text-blue-100/90 hover:bg-blue-500/10 active:bg-blue-500/15" 
              : "hover:bg-accent"
          )}
        >
          <Eye className={cn("w-4 h-4", isMobile && "text-blue-300/60")} />
          View
        </button>
      )}
      
      {onDownload && (
        <button
          onClick={handleDownload}
          className={cn(
            "w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors",
            isMobile 
              ? "text-blue-100/90 hover:bg-blue-500/10 active:bg-blue-500/15" 
              : "hover:bg-accent"
          )}
        >
          <Download className={cn("w-4 h-4", isMobile && "text-blue-300/60")} />
          Download
        </button>
      )}
      
      {onShare && (
        <button
          onClick={handleShare}
          className={cn(
            "w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors",
            isMobile 
              ? "text-blue-100/90 hover:bg-blue-500/10 active:bg-blue-500/15" 
              : "hover:bg-accent"
          )}
        >
          <Share2 className={cn("w-4 h-4", isMobile && "text-blue-300/60")} />
          Share & Copy Link
        </button>
      )}
      
      {onInfo && (
        <button
          onClick={handleInfo}
          className={cn(
            "w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors",
            isMobile 
              ? "text-blue-100/90 hover:bg-blue-500/10 active:bg-blue-500/15" 
              : "hover:bg-accent"
          )}
        >
          <Info className={cn("w-4 h-4", isMobile && "text-blue-300/60")} />
          File Info
        </button>
      )}

      {/* Bookmark Button */}
      {item && (
        <button
          onClick={handleToggleBookmark}
          className={cn(
            "w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors",
            isMobile 
              ? "text-blue-100/90 hover:bg-blue-500/10 active:bg-blue-500/15" 
              : "hover:bg-accent"
          )}
        >
          <Star className={cn(
            "w-4 h-4", 
            isMobile && "text-blue-300/60",
            itemBookmarked && "fill-yellow-400 text-yellow-400"
          )} />
          {itemBookmarked ? 'Remove from Favorites' : 'Add to Favorites'}
        </button>
      )}

      {/* Color Picker */}
      {item && (
        <div className="relative">
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className={cn(
              "w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors",
              isMobile 
                ? "text-blue-100/90 hover:bg-blue-500/10 active:bg-blue-500/15" 
                : "hover:bg-accent"
            )}
          >
            <Palette className={cn("w-4 h-4", isMobile && "text-blue-300/60")} />
            <span className="flex-1">Set Color</span>
            {itemColor && (
              <span 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: itemColor }} 
              />
            )}
          </button>
          
          {showColorPicker && (
            <div 
              className={cn(
                "absolute p-2.5 rounded-lg shadow-2xl z-[100]",
                isMobile 
                  ? "bg-[#1a1a2e] border border-blue-500/30" 
                  : "bg-popover border border-border shadow-lg"
              )}
              style={{
                bottom: '0',
                left: '0',
                transform: 'translateY(100%)',
                marginTop: '4px',
                minWidth: '140px'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-[10px] font-medium text-muted-foreground mb-2">Choose color</div>
              <div className="grid grid-cols-4 gap-2">
                {FILE_COLORS.map((color) => (
                  <button
                    key={color.name}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetColor(color.value);
                    }}
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center transition-all hover:scale-110 hover:ring-2 hover:ring-offset-1 hover:ring-offset-background",
                      color.value === '' ? "border-2 border-dashed border-muted-foreground/40 hover:border-muted-foreground" : "hover:ring-current",
                      itemColor === color.value && "ring-2 ring-offset-1 ring-offset-background"
                    )}
                    style={{ 
                      backgroundColor: color.value || 'transparent',
                      ['--tw-ring-color' as any]: color.value || 'hsl(var(--muted-foreground))'
                    }}
                    title={color.name}
                  >
                    {itemColor === color.value && (
                      <Check className={cn("w-3 h-3", color.value ? "text-white" : "text-muted-foreground")} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {onViewArchive && (
        <button
          onClick={() => {
            onViewArchive();
            onClose();
          }}
          className={cn(
            "w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors",
            isMobile 
              ? "text-blue-100/90 hover:bg-blue-500/10 active:bg-blue-500/15" 
              : "hover:bg-accent"
          )}
        >
          <FolderOpen className={cn("w-4 h-4", isMobile && "text-blue-300/60")} />
          View Contents
        </button>
      )}

      {onExtract && (
        <button
          onClick={handleExtract}
          className={cn(
            "w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors",
            isMobile 
              ? "text-blue-100/90 hover:bg-blue-500/10 active:bg-blue-500/15" 
              : "hover:bg-accent"
          )}
        >
          <Archive className={cn("w-4 h-4", isMobile && "text-blue-300/60")} />
          Extract Archive
        </button>
      )}
      
      {onDelete && (
        <>
          <div className={cn("h-px my-1", isMobile ? "bg-blue-500/20 mx-3" : "bg-border")} />
          <button
            onClick={handleDelete}
            className={cn(
              "w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors",
              isMobile 
                ? "text-red-400 hover:bg-red-500/15 active:bg-red-500/20" 
                : "hover:bg-destructive hover:text-destructive-foreground"
            )}
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </>
      )}
    </div>
  );
};

export default UniversalContextMenu;
