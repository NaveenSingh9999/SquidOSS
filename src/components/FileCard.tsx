import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { formatFileSize, cn } from '@/lib/utils';
import { FileIcon, FolderIcon, MoreVertical, Share2, Lock } from '@/lib/icon-map';
import FileCardMenu from './FileCardMenu';
import MobileFileActionSheet from './MobileFileActionSheet';
import MobilePreviewModal from './MobilePreviewModal';
import EnhancedInstantPreviewModal from './EnhancedInstantPreviewModal';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { createFileShare, getFileShareId } from '@/lib/api';
import { buildPublicUrl } from '@/lib/appLinks';

interface FileCardProps {
  file: any;
  isSelected?: boolean;
  onSelect?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  onShareChange?: () => void;
  onDelete?: () => void;
  onExtract?: () => void;
  onInfo?: () => void;
  viewMode?: 'grid' | 'list';
}

const FileCard: React.FC<FileCardProps> = ({
  file,
  isSelected,
  onSelect,
  onDownload,
  onShareChange,
  onShare,
  onDelete,
  onExtract,
  onInfo,
  viewMode = 'grid'
}) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isMobile = useIsMobile();
  const { toast } = useToast();

  // Check if file is already shared when component mounts
  React.useEffect(() => {
    const checkShareStatus = async () => {
      try {
        const shareId = await getFileShareId(file.id);
        if (shareId) {
          setIsShared(true);
          setShareUrl(buildPublicUrl(`/s/${shareId}`));
        }
      } catch (error) {
        console.error('Failed to check share status:', error);
      }
    };

    checkShareStatus();
  }, [file.id]);

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    if (target.closest('button') || 
        target.closest('[role="menuitem"]') || 
        target.closest('[data-radix-dropdown-menu-item]') ||
        target.closest('[data-radix-dropdown-menu-content]')) {
      return;
    }
    
    if (e.target === e.currentTarget || 
        target.closest('.file-card-content')) {
      e.preventDefault();
      e.stopPropagation();
      onSelect?.();
    }
  };

  const handleView = () => {
    setPreviewOpen(true);
  };

  const handleInfo = () => {
    onInfo?.();
  };

  const handleMobileMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setMobileMenuOpen(true);
    
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  };

  const handleShareAction = async () => {
    if (loading) return;
    
    try {
      setLoading(true);
      
      if (isShared && shareUrl) {
        await navigator.clipboard.writeText(shareUrl);
        toast({
          title: "Share link copied",
          description: "The share link has been copied to your clipboard.",
        });
      } else {
        const { shareUrl: newShareUrl } = await createFileShare(file.id);
        setShareUrl(newShareUrl);
        setIsShared(true);
        
        await navigator.clipboard.writeText(newShareUrl);
        toast({
          title: "Share link created",
          description: "The share link has been copied to your clipboard.",
        });
      }
      
      if (onShare) {
        onShare();
      }
    } catch (error: any) {
      toast({
        title: "Share failed",
        description: error.message || "Failed to create share link",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyFile = async () => {
    toast({
      title: "Copy feature coming soon",
      description: "File copying functionality will be available in the next update.",
    });
  };

  const handleMoveFile = async () => {
    toast({
      title: "Move feature coming soon",
      description: "File moving functionality will be available in the next update.",
    });
  };

  const handleRenameFile = async () => {
    toast({
      title: "Rename feature coming soon",
      description: "File renaming functionality will be available in the next update.",
    });
  };

  const handleFavoriteFile = async () => {
    toast({
      title: "Favorites feature coming soon",
      description: "File favorites functionality will be available in the next update.",
    });
  };

  const handleArchiveFile = async () => {
    toast({
      title: "Archive feature coming soon",
      description: "File archiving functionality will be available in the next update.",
    });
  };

  const isFolder = file.type === 'folder';
  const isImage = file.type?.startsWith('image/');
  const isVideo = file.type?.startsWith('video/');
  const isDocument = file.type?.includes('pdf') || 
                     file.type?.includes('document') || 
                     file.type?.includes('text');

  const getFileIcon = () => {
    const iconClass = "w-6 h-6";
    if (isFolder) return <FolderIcon className={cn(iconClass, "text-primary")} strokeWidth={1.5} />;
    if (isImage) return <FileIcon className={cn(iconClass, "text-emerald-500")} strokeWidth={1.5} />;
    if (isVideo) return <FileIcon className={cn(iconClass, "text-purple-500")} strokeWidth={1.5} />;
    if (isDocument) return <FileIcon className={cn(iconClass, "text-rose-500")} strokeWidth={1.5} />;
    return <FileIcon className={cn(iconClass, "text-muted-foreground")} strokeWidth={1.5} />;
  };

  // LIST VIEW
  if (viewMode === 'list') {
    return (
      <>
        <div
          className={cn(
            "group relative flex items-center gap-4 cursor-pointer",
            "px-4 py-3 rounded-xl",
            "transition-all duration-200",
            // Premium hover and selection states
            "hover:bg-accent/50",
            "border border-transparent",
            isSelected && "bg-primary/5 border-primary/20 shadow-sm"
          )}
          onClick={handleCardClick}
        >
          {/* Icon */}
          <div className={cn(
            "flex items-center justify-center shrink-0",
            "h-11 w-11 rounded-xl",
            "bg-muted/50 border border-border/50",
            "transition-colors duration-200",
            "group-hover:bg-muted group-hover:border-border"
          )}>
            {getFileIcon()}
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0 file-card-content">
            <p className={cn(
              "font-medium text-sm truncate text-foreground",
              "transition-colors duration-200"
            )} title={file.name}>
              {file.name}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-muted-foreground">
                {!isFolder && formatFileSize(file.size)}
                {file.updated_at && ` · ${formatDistanceToNow(new Date(file.updated_at), { addSuffix: true })}`}
              </p>
            </div>
          </div>
          
          {/* Badges */}
          <div className="flex items-center gap-2 shrink-0">
            {isShared && (
              <span className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full",
                "text-[10px] font-medium",
                "bg-primary/10 text-primary border border-primary/20"
              )}>
                <Share2 className="h-3 w-3" strokeWidth={2} />
              </span>
            )}
            
            {file.encrypted && (
              <span className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full",
                "text-[10px] font-medium",
                "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              )}>
                <Lock className="w-2.5 h-2.5" />
              </span>
            )}
          </div>
          
          {/* Actions */}
          <div className="shrink-0">
            {isMobile ? (
              <button
                onClick={handleMobileMenuClick}
                className={cn(
                  "flex items-center justify-center",
                  "h-9 w-9 rounded-lg",
                  "bg-muted/50 border border-border/50",
                  "text-muted-foreground hover:text-foreground",
                  "hover:bg-muted hover:border-border",
                  "transition-all duration-150 active:scale-95",
                  "touch-manipulation"
                )}
              >
                <MoreVertical className="h-4 w-4" strokeWidth={2} />
              </button>
            ) : (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <FileCardMenu
                  file={file}
                  onView={!isFolder ? handleView : undefined}
                  onDownload={onDownload}
                  onShare={onShare}
                  onShareChange={onShareChange}
                  onInfo={handleInfo}
                  onDelete={onDelete}
                  onExtract={onExtract}
                />
              </div>
            )}
          </div>
        </div>

        {!isFolder && (
          <>
            {isMobile ? (
              <MobilePreviewModal
                file={file}
                isOpen={previewOpen}
                onClose={() => setPreviewOpen(false)}
                onDownload={onDownload}
                onShare={onShare} onShareChange={onShareChange}
              />
            ) : (
              <EnhancedInstantPreviewModal
                file={file}
                isOpen={previewOpen}
                onClose={() => setPreviewOpen(false)}
                onDownload={onDownload}
                onShare={onShare} onShareChange={onShareChange}
              />
            )}
          </>
        )}

        {isMobile && (
          <MobileFileActionSheet
            isOpen={mobileMenuOpen}
            onClose={() => setMobileMenuOpen(false)}
            file={file}
            onView={!isFolder ? handleView : undefined}
            onDownload={onDownload}
            onShare={handleShareAction}
            onInfo={handleInfo}
            onCopy={handleCopyFile}
            onMove={handleMoveFile}
            onRename={handleRenameFile}
            onFavorite={handleFavoriteFile}
            onArchive={handleArchiveFile}
            onDelete={onDelete}
          />
        )}
      </>
    );
  }

  // GRID VIEW - Premium card design
  return (
    <>
      <div
        className={cn(
          "group relative cursor-pointer",
          "p-4 rounded-xl",
          "bg-card/50 border border-border/40",
          "transition-all duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
          "hover:bg-card hover:border-border/70 hover:shadow-lg hover:shadow-black/5 hover:-translate-y-[2px]",
          isSelected && "border-primary/40 bg-primary/5 ring-1 ring-primary/20 shadow-sm"
        )}
        onClick={handleCardClick}
        style={{ minHeight: viewMode === 'grid' ? '132px' : undefined }}
      >
        <div className="file-card-content h-full flex flex-col">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div className={cn(
              "flex items-center justify-center shrink-0",
              "h-10 w-10 rounded-xl",
              "bg-muted/30 border border-border/20",
              "transition-all duration-200",
              "group-hover:bg-muted/50 group-hover:border-border/40 group-hover:scale-105"
            )}>
              {getFileIcon()}
            </div>
            
            {isMobile ? (
              <button
                onClick={handleMobileMenuClick}
                className={cn(
                  "flex items-center justify-center shrink-0",
                  "h-8 w-8 rounded-lg",
                  "bg-transparent hover:bg-muted",
                  "text-muted-foreground hover:text-foreground",
                  "transition-all duration-150 active:scale-95",
                  "touch-manipulation"
                )}
              >
                <MoreVertical className="h-4 w-4" strokeWidth={2} />
              </button>
            ) : (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <FileCardMenu
                  file={file}
                  onView={!isFolder ? handleView : undefined}
                  onDownload={onDownload}
                  onShare={onShare}
                  onShareChange={onShareChange}
                  onInfo={handleInfo}
                  onDelete={onDelete}
                  onExtract={onExtract}
                />
              </div>
            )}
          </div>
          
          {/* Content */}
          <div className="flex-1 mt-3 space-y-1">
            <h3 className={cn(
              "font-medium text-[13px] leading-tight truncate text-foreground/90",
              "group-hover:text-foreground transition-colors duration-200"
            )} title={file.name}>
              {file.name && file.name.length > 22 ? file.name.substring(0, 22) + '…' : file.name}
            </h3>
            
            <div className="flex items-center gap-2 flex-wrap">
              {!isFolder && (
                <span className="text-[11px] text-muted-foreground/70 font-medium">
                  {formatFileSize(file.size)}
                </span>
              )}
              
              {file.encrypted && (
                <span className={cn(
                  "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full",
                  "text-[9px] font-medium",
                  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                )}>
                  <Lock className="w-2.5 h-2.5" />
                </span>
              )}
              
              {isShared && (
                <span className={cn(
                  "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full",
                  "text-[9px] font-medium",
                  "bg-primary/10 text-primary"
                )}>
                  <Share2 className="w-2.5 h-2.5" />
                </span>
              )}
            </div>
            
            {file.updated_at && (
              <p className="text-[10px] text-muted-foreground/50 pt-0.5 font-medium">
                {new Date(file.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </p>
            )}
          </div>
        </div>
      </div>

      {!isFolder && (
        <>
          {isMobile ? (
            <MobilePreviewModal
              file={file}
              isOpen={previewOpen}
              onClose={() => setPreviewOpen(false)}
              onDownload={onDownload}
              onShare={onShare} onShareChange={onShareChange}
            />
          ) : (
            <EnhancedInstantPreviewModal
              file={file}
              isOpen={previewOpen}
              onClose={() => setPreviewOpen(false)}
              onDownload={onDownload}
              onShare={onShare} onShareChange={onShareChange}
            />
          )}
        </>
      )}

      {isMobile && (
        <MobileFileActionSheet
          isOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          file={file}
          onView={!isFolder ? handleView : undefined}
          onDownload={onDownload}
          onShare={handleShareAction}
          onInfo={handleInfo}
          onCopy={handleCopyFile}
          onMove={handleMoveFile}
          onRename={handleRenameFile}
          onFavorite={handleFavoriteFile}
          onArchive={handleArchiveFile}
          onDelete={onDelete}
        />
      )}
    </>
  );
};

export default FileCard;