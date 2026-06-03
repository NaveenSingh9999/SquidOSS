import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, Image, Video, Music, Archive, File, Folder, MoreVertical, Star, Lock } from '@/lib/icon-map';
import { formatBytes, FileItem as FileItemType } from '@/lib/api';
import FileActionMenu from './FileActionMenu';
import FileViewer from './FileViewer';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useBookmarks } from '@/hooks/use-bookmarks';
import { cn } from '@/lib/utils';

interface FileItemProps {
  file: FileItemType;
  viewMode: 'grid' | 'list';
  onDelete?: (file: FileItemProps['file']) => void;
  onShare?: (file: FileItemProps['file']) => void;
  onDownload?: (file: FileItemProps['file']) => void;
  onClick?: (file: FileItemProps['file']) => void;
  onViewInfo?: (file: any) => void;
  onPreview?: () => void;
  selected?: boolean;
  showVaultActions?: boolean;
  onMoveToVault?: (file: FileItemProps['file']) => void;
  onRemoveFromVault?: (file: FileItemProps['file']) => void;
  onShareRevoked?: (fileId: string) => void;
  onShareChange?: (fileId: string) => void;
  onExtract?: (file: FileItemProps['file']) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (fileId: string) => void;
  onOpenInCbCode?: (file: FileItemProps['file']) => void;
}

const FileItem: React.FC<FileItemProps> = ({ 
  file, 
  viewMode, 
  onDelete, 
  onShare, 
  onDownload,
  onClick,
  onViewInfo,
  onPreview,
  selected = false,
  showVaultActions = false,
  onMoveToVault,
  onRemoveFromVault,
  onShareRevoked,
  onShareChange,
  onExtract,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  onOpenInCbCode
}) => {
  // State for UI interactions
  const [viewerOpen, setViewerOpen] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { isBookmarked, getColor } = useBookmarks();
  
  // Get bookmark and color status
  const bookmarked = isBookmarked(file.id);
  const fileColor = getColor(file.id);

  // Ensure updated_at has a fallback
  const fileWithDefaults = {
    ...file,
    updated_at: file.updated_at || file.created_at
  } as FileItemType;

  // Helper function to truncate filename
  const truncateFileName = (name: string, maxLength: number = 15) => {
    if (name.length <= maxLength) return name;
    const extension = name.split('.').pop();
    const nameWithoutExt = name.substring(0, name.lastIndexOf('.'));
    if (nameWithoutExt.length <= maxLength - extension!.length - 1) {
      return name;
    }
    return `${nameWithoutExt.substring(0, maxLength - extension!.length - 4)}...${extension}`;
  };

  const getFileIcon = () => {
    const type = file.type.toLowerCase();
    const name = file.name.toLowerCase();
    
    if (type.startsWith('image/')) {
      return <Image className="h-8 w-8 text-blue-500" />;
    }
    if (type.startsWith('video/')) {
      return <Video className="h-8 w-8 text-red-500" />;
    }
    if (type.startsWith('audio/')) {
      return <Music className="h-8 w-8 text-green-500" />;
    }
    if (type.includes('pdf') || type.includes('document')) {
      return <FileText className="h-8 w-8 text-red-600" />;
    }
    if (type.includes('zip') || type.includes('rar') || type.includes('archive')) {
      return <Archive className="h-8 w-8 text-yellow-600" />;
    }
    if (name.includes('folder') || type.includes('directory')) {
      return <Folder className="h-8 w-8 text-blue-600" />;
    }
    return <File className="h-8 w-8 text-gray-500" />;
  };

  const getFileTypeLabel = () => {
    const type = file.type.toLowerCase();
    const name = file.name.toLowerCase();
    if (type.startsWith('image/')) return 'Image';
    if (type.startsWith('video/')) return 'Video';
    if (type.startsWith('audio/')) return 'Audio';
    if (type.includes('pdf')) return 'PDF';
    if (type.includes('zip') || type.includes('rar') || type.includes('7z') || type.includes('tar') || type.includes('gz')) return 'Archive';
    if (type.includes('document') || type.includes('word')) return 'Doc';
    if (name.endsWith('.txt') || type.includes('text')) return 'Text';
    if (name.endsWith('.csv') || name.endsWith('.xls') || name.endsWith('.xlsx')) return 'Spreadsheet';
    return '';
  };

  const handleView = () => {
    if (onPreview) {
      onPreview();
    } else {
      setViewerOpen(true);
    }
  };

  const handleShare = () => {
    if (onShare) {
      onShare(file);
    } else {
      toast({
        title: "Share feature",
        description: "Share functionality will be implemented soon",
      });
    }
  };

  const handleItemClick = (e: React.MouseEvent) => {
    // If in selection mode, toggle selection instead of opening file
    if (selectionMode && onToggleSelect) {
      e.stopPropagation();
      onToggleSelect(file.id);
      return;
    }
    
    // Only process click if not targeting a button or dropdown menu
    const target = e.target as HTMLElement;
    
    // Check for dropdown menu and its various components
    if (target.closest('button') || 
        target.closest('.dropdown-trigger') ||
        target.closest('[data-radix-dropdown-menu-trigger]') ||
        target.closest('[data-radix-dropdown-menu-content]') ||
        target.closest('[data-radix-dropdown-menu-item]') ||
        target.closest('[role="menuitem"]') ||
        target.closest('[role="menu"]') ||
        target.closest('[data-checkbox]')) {
      console.log('FileItem: Click on dropdown/checkbox element, ignoring');
      return;
    }
    
    console.log('FileItem: Card clicked, triggering action');
    
    // Single unified click handler for both grid and list modes
    if (onClick) {
      onClick(file);
    } else if (onPreview) {
      onPreview();
    } else {
      setViewerOpen(true);
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(file);
    } else {
      toast({
        title: "Delete failed",
        description: "Delete functionality is not available",
        variant: "destructive",
      });
    }
  };

  const handleDownload = () => {
    if (onDownload) {
      onDownload(file);
    } else {
      toast({
        title: "Download started",
        description: `Downloading ${file.name}...`,
      });
    }
  };

  if (viewMode === 'list') {
    return (
      <>
        <div className={cn(
          "flex items-center space-x-4 p-3 rounded-xl cursor-pointer group transition-all duration-150 relative overflow-hidden",
          isMobile 
            ? cn(
                "bg-card/60 border border-border/30 backdrop-blur-sm",
                "hover:bg-card/80 active:scale-[0.99]"
              )
            : "hover:bg-accent/50 border border-border/40",
          selected && "bg-accent",
          isSelected && "bg-primary/10 border-primary/50"
        )}>
          {/* Color stripe indicator - left edge */}
          {fileColor && (
            <div 
              className="absolute left-0 top-0 bottom-0 w-1" 
              style={{ backgroundColor: fileColor }}
            />
          )}
          
          {/* Checkbox for selection mode */}
          {selectionMode && (
            <div 
              data-checkbox
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect?.(file.id);
              }}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelect?.(file.id)}
                className={cn("h-5 w-5", isMobile && "border-white/30")}
              />
            </div>
          )}
          
          <div onClick={handleItemClick} className="flex items-center space-x-4 flex-1">
            <div className={cn(
              "flex-shrink-0",
              isMobile && "p-2 rounded-xl bg-accent/30"
            )}>
              {getFileIcon()}
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-sm font-medium truncate flex items-center gap-1.5",
                isMobile && "text-foreground"
              )} title={file.name}>
                {bookmarked && <Star className="w-3 h-3 flex-shrink-0 fill-yellow-400 text-yellow-400" />}
                {isMobile ? truncateFileName(file.name) : file.name}
              </p>
              <div className="flex items-center space-x-2 mt-1">
                <p className={cn("text-xs text-muted-foreground")}>
                  {formatBytes(file.size)}
                </p>
                <span className="text-border">•</span>
                <p className={cn("text-xs text-muted-foreground")}>
                  {formatDistanceToNow(new Date(file.created_at), { addSuffix: true })}
                </p>
                {getFileTypeLabel() && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-border/30 text-muted-foreground/70">
                    {getFileTypeLabel()}
                  </Badge>
                )}
                {file.encrypted && (
                  <Badge variant="secondary" className={cn(
                    "text-xs",
                    isMobile && "bg-primary/20 text-primary border-0"
                  )}>
                    Encrypted
                  </Badge>
                )}
                {file.shared && (
                  <Badge variant="outline" className={cn(
                    "text-xs",
                    isMobile && "bg-accent/30 text-muted-foreground border-border/40"
                  )}>
                    Shared
                  </Badge>
                )}
              </div>
            </div>
          </div>
          
          {!selectionMode && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <FileActionMenu
                file={file}
                onView={handleView}
                onShare={handleShare}
                onViewInfo={onViewInfo}
                onDelete={handleDelete}
                onDownload={handleDownload}
                onMoveToVault={onMoveToVault}
                onRemoveFromVault={onRemoveFromVault}
                showVaultActions={showVaultActions}
                onShareRevoked={onShareRevoked}
                onShareChange={onShareChange}
                onExtract={onExtract ? () => onExtract(file) : undefined}
                onOpenInCbCode={onOpenInCbCode ? () => onOpenInCbCode(file) : undefined}
              />
            </div>
          )}
        </div>
        
        <FileViewer
          file={fileWithDefaults}
          open={viewerOpen}
          onClose={() => setViewerOpen(false)}
          onDelete={onDelete}
          onShare={onShare}
          onDownload={onDownload}
        />
      </>
    );
  }

  return (
    <>
      <Card className={cn(
        "group cursor-pointer relative overflow-hidden transition-all duration-150",
        "bg-card border-border/40",
        "hover:border-border/70 hover:bg-accent/30 hover:shadow-sm",
        isMobile && "active:bg-accent/30",
        selected && 'ring-2 ring-primary',
        isSelected && "bg-accent/50 border-primary/50 ring-1 ring-primary/30"
      )}>
        {/* Color stripe indicator */}
        {fileColor && (
          <div 
            className="absolute top-0 left-0 right-0 h-1" 
            style={{ backgroundColor: fileColor }}
          />
        )}
        
        {/* Bookmark star indicator */}
        {bookmarked && (
          <div className="absolute top-1.5 right-1.5 z-10">
            <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400 drop-shadow-sm" />
          </div>
        )}

        {/* Checkbox for selection mode - top left corner */}
        {selectionMode && (
          <div 
            data-checkbox
            className="absolute top-2 left-2 z-10"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(file.id);
            }}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect?.(file.id)}
              className={cn(
                "h-5 w-5 shadow-md",
                "bg-background/80 border-border"
              )}
            />
          </div>
        )}
        
        <CardContent className={cn("p-3", selectionMode && "pt-8", fileColor && "pt-4")}>
          <div onClick={handleItemClick}>
            <div className="flex items-center justify-between mb-2">
              <div className={cn(
                "flex-shrink-0 p-2 rounded-lg transition-colors",
                "bg-primary/10 group-hover:bg-primary/15"
              )}>
                {getFileIcon()}
              </div>
              {!selectionMode && (
                <>
                  {isMobile ? (
                    // Mobile: Always show action button
                    <div className="flex-shrink-0">
                      <FileActionMenu
                        file={file}
                        onView={handleView}
                        onShare={handleShare}
                        onViewInfo={onViewInfo}
                        onDelete={handleDelete}
                        onDownload={handleDownload}
                        onMoveToVault={onMoveToVault}
                        onRemoveFromVault={onRemoveFromVault}
                        showVaultActions={showVaultActions}
                        onShareRevoked={onShareRevoked}
                        onShareChange={onShareChange}
                        onExtract={onExtract ? () => onExtract(file) : undefined}
                        onOpenInCbCode={onOpenInCbCode ? () => onOpenInCbCode(file) : undefined}
                        trigger={
                          <button className="p-1.5 hover:bg-accent rounded-lg transition-colors active:scale-95">
                            <MoreVertical className="w-4 h-4 text-muted-foreground" />
                          </button>
                        }
                      />
                    </div>
                  ) : (
                    // Desktop: Show on hover
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <FileActionMenu
                        file={file}
                        onView={handleView}
                        onShare={handleShare}
                        onViewInfo={onViewInfo}
                        onDelete={handleDelete}
                        onDownload={handleDownload}
                        onMoveToVault={onMoveToVault}
                        onRemoveFromVault={onRemoveFromVault}
                        showVaultActions={showVaultActions}
                        onShareRevoked={onShareRevoked}
                        onShareChange={onShareChange}
                        onExtract={onExtract ? () => onExtract(file) : undefined}
                        onOpenInCbCode={onOpenInCbCode ? () => onOpenInCbCode(file) : undefined}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
            
            <div className="space-y-1.5">
              <h3 className="font-medium text-sm truncate text-foreground group-hover:text-primary transition-colors" title={file.name}>
                {truncateFileName(file.name)}
              </h3>
              
              {/* File metadata */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">{formatBytes(file.size)}</span>
                <span className="text-border">•</span>
                <span>{formatDistanceToNow(new Date(file.created_at), { addSuffix: true })}</span>
              </div>
              
              {/* Status badges */}
              {(file.encrypted || file.shared || file.is_public) && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {file.encrypted && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-0 gap-0.5">
                      <Lock className="w-2.5 h-2.5" />
                      Encrypted
                    </Badge>
                  )}
                  {file.shared && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-border/40">
                      Shared
                    </Badge>
                  )}
                  {file.is_public && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-green-500/10 text-green-600 border-0">
                      Public
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <FileViewer
        file={fileWithDefaults}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        onDelete={onDelete}
        onShare={onShare}
        onDownload={onDownload}
      />
    </>
  );
};

export default React.memo(FileItem, (prevProps, nextProps) => {
  return (
    prevProps.file.id === nextProps.file.id &&
    prevProps.file.updated_at === nextProps.file.updated_at &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.viewMode === nextProps.viewMode &&
    prevProps.selectionMode === nextProps.selectionMode
  );
});
