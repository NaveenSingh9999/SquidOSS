import React from 'react';
import { 
  Share2, 
  Download, 
  Eye, 
  Trash2, 
  Info, 
  Copy, 
  Archive,
  Star,
  Move,
  Edit,
  X
} from '@/lib/icon-map';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface MobileFileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  fileSize?: string;
  fileType?: string;
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

const MobileFileMenu: React.FC<MobileFileMenuProps> = ({
  isOpen,
  onClose,
  fileName,
  fileSize,
  fileType,
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
  isEncrypted = false
}) => {
  if (!isOpen) return null;

  const menuItems = [
    {
      icon: Eye,
      label: 'View',
      onClick: onView,
      primary: true,
    },
    {
      icon: Download,
      label: 'Download',
      onClick: onDownload,
      primary: true,
    },
    {
      icon: Share2,
      label: 'Share',
      onClick: onShare,
      primary: true,
    },
    {
      icon: Info,
      label: 'Details',
      onClick: onInfo,
    },
    {
      icon: Copy,
      label: 'Make a copy',
      onClick: onCopy,
    },
    {
      icon: Move,
      label: 'Move',
      onClick: onMove,
    },
    {
      icon: Edit,
      label: 'Rename',
      onClick: onRename,
    },
    {
      icon: Star,
      label: isFavorited ? 'Remove from favorites' : 'Add to favorites',
      onClick: onFavorite,
    },
    {
      icon: Archive,
      label: 'Archive',
      onClick: onArchive,
    },
    {
      icon: Trash2,
      label: 'Delete',
      onClick: onDelete,
      destructive: true,
    }
  ].filter(item => item.onClick); // Only show items with handlers

  const handleItemClick = (onClick: () => void) => {
    onClick();
    onClose();
    
    // Add haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-50 mobile-menu-backdrop"
        onClick={handleBackdropClick}
        style={{ backdropFilter: 'blur(8px)' }}
      />
      
      {/* Bottom Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 mobile-menu-content">
        <div className="bg-background/98 backdrop-blur-xl rounded-t-2xl shadow-2xl border-t border-border/50 max-h-[70vh] overflow-hidden backdrop-blur-smooth">
          
          {/* Handle Bar */}
          <div className="flex justify-center py-3">
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full"></div>
          </div>
          
          {/* File Header */}
          <div className="px-6 pb-4 border-b border-border/30">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold truncate text-foreground">
                  {fileName}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  {fileSize && (
                    <span className="text-sm text-muted-foreground">{fileSize}</span>
                  )}
                  {fileType && (
                    <Badge variant="secondary" className="text-xs">
                      {fileType.toUpperCase()}
                    </Badge>
                  )}
                  {isEncrypted && (
                    <Badge variant="outline" className="text-xs border-green-500/30 text-green-600">
                      Encrypted
                    </Badge>
                  )}
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="p-2 hover:bg-muted/50 rounded-full transition-all duration-200 hover:scale-110 active:scale-95"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Menu Items */}
          <div className="max-h-96 overflow-y-auto">
            <div className="py-2">
              {menuItems.map((item, index) => (
                <Button
                  key={item.label}
                  variant="ghost"
                  onClick={() => handleItemClick(item.onClick)}
                  className={cn(
                    "w-full h-14 px-6 flex items-center gap-4 justify-start rounded-none mobile-touch-target mobile-ripple",
                    "transition-all duration-200 hover:bg-muted/50 active:scale-95 mobile-menu-item",
                    item.destructive && "text-destructive hover:text-destructive hover:bg-destructive/10",
                    item.primary && "font-medium"
                  )}
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <item.icon className={cn(
                    "h-5 w-5 transition-all duration-200",
                    item.destructive ? "text-destructive" : "text-muted-foreground",
                    item.primary && "text-primary"
                  )} />
                  <span className="text-base">{item.label}</span>
                  
                  {item.label.includes('favorites') && isFavorited && (
                    <Star className="h-4 w-4 ml-auto text-yellow-500 fill-yellow-500" />
                  )}
                </Button>
              ))}
            </div>
          </div>
          
          {/* Safe Area for iPhone */}
          <div className="h-safe-area-inset-bottom bg-background/50"></div>
        </div>
      </div>
    </>
  );
};

export default MobileFileMenu;