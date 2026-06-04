
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Eye, Download, Share2, Info, Trash2, Archive, History, XCircle, Settings, Code2 } from '@/lib/icon-map';
import { useToast } from '@/hooks/use-toast';
import { isFeatureEnabled } from '@/hooks/useFeatureFlags';
import { createFileShare, revokeFileShare, getFileShareId } from '@/lib/api';
import ShareManagementDialog from './ShareManagementDialog';
import { EnhancedShareDialog } from './EnhancedShareDialog';
import { buildPublicUrl } from '@/lib/appLinks';

const sharingEnabled = isFeatureEnabled('sharing')

interface FileCardMenuProps {
  file: any;
  onShareChange?: () => void;
  onView?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  onInfo?: () => void;
  onDelete?: () => void;
  onExtract?: () => void;
  onVersionHistory?: () => void;
  onOpenInCbCode?: () => void;
}

const FileCardMenu: React.FC<FileCardMenuProps> = ({
  file,
  onView,
  onDownload,
  onShare,
  onInfo,
  onDelete,
  onExtract,
  onVersionHistory,
  onOpenInCbCode,
  onShareChange,
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showEnhancedShareDialog, setShowEnhancedShareDialog] = useState(false);

  // Check if file is already shared when component mounts
  useEffect(() => {
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

  const handleMenuAction = (action: () => void, actionName: string) => {
    return (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
      action();
      console.log(`${actionName} action triggered for file:`, file.name);
    };
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    setShowEnhancedShareDialog(true);
    setOpen(false);
  };

  const handleRevokeShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (loading) return;
    
    try {
      setLoading(true);
      
      const success = await revokeFileShare(file.id);
      if (success) {
        setIsShared(false);
        setShareUrl(null);
        toast({
          title: "Share revoked",
          description: "The share link has been disabled successfully.",
        });
      } else {
        throw new Error("Failed to revoke share");
      }
    } catch (error: any) {
      console.error('Failed to revoke share:', error);
      toast({
        title: "Revoke failed",
        description: error.message || "Failed to revoke share",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  const isArchive = file.type === 'application/zip' || 
                   file.type === 'application/x-zip-compressed' ||
                   file.name?.endsWith('.zip');

  return (
    <>
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 w-8 p-0 hover:bg-accent"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 z-[9999]">
        {onView && (
          <DropdownMenuItem onClick={handleMenuAction(onView, 'View')}>
            <Eye className="mr-2 h-4 w-4" />
            View
          </DropdownMenuItem>
        )}
        
        {onDownload && (
          <DropdownMenuItem onClick={handleMenuAction(onDownload, 'Download')}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </DropdownMenuItem>
        )}
        
        {sharingEnabled && (
          <DropdownMenuItem onClick={handleShare} disabled={loading}>
            <Share2 className="mr-2 h-4 w-4" />
            {loading ? 'Creating...' : isShared ? 'Copy Share Link' : 'Share'}
          </DropdownMenuItem>
        )}
        
        {sharingEnabled && isShared && (
          <DropdownMenuItem onClick={handleRevokeShare} disabled={loading}>
            <XCircle className="mr-2 h-4 w-4" />
            {loading ? 'Revoking...' : 'Revoke Share'}
          </DropdownMenuItem>
        )}
        
        <DropdownMenuSeparator />
        
        {sharingEnabled && (
          <DropdownMenuItem onClick={handleMenuAction(() => {
            setShowShareDialog(true);
          }, 'Manage All Shares')}>
            <Settings className="mr-2 h-4 w-4" />
            Manage All Shares
          </DropdownMenuItem>
        )}

        {onOpenInCbCode && (
          <DropdownMenuItem onClick={handleMenuAction(onOpenInCbCode, 'Open in cbCode')}>
            <Code2 className="mr-2 h-4 w-4" />
            Open in cbCode
          </DropdownMenuItem>
        )}
        
        {onInfo && (
          <DropdownMenuItem onClick={handleMenuAction(onInfo, 'File Info')}>
            <Info className="mr-2 h-4 w-4" />
            File Info
          </DropdownMenuItem>
        )}

        {onVersionHistory && (
          <DropdownMenuItem onClick={handleMenuAction(onVersionHistory, 'Version History')}>
            <History className="mr-2 h-4 w-4" />
            Version History
          </DropdownMenuItem>
        )}

        {isArchive && onExtract && (
          <DropdownMenuItem onClick={handleMenuAction(onExtract, 'Extract')}>
            <Archive className="mr-2 h-4 w-4" />
            Extract Archive
          </DropdownMenuItem>
        )}
        
        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={handleMenuAction(onDelete, 'Delete')}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
    
    <ShareManagementDialog 
      open={showShareDialog} 
      onOpenChange={setShowShareDialog}
    />
    <EnhancedShareDialog
      open={showEnhancedShareDialog}
      onClose={() => setShowEnhancedShareDialog(false)}
      onShareChange={onShareChange}
      file={file}
    />
    </>
  );
};

export default FileCardMenu;
