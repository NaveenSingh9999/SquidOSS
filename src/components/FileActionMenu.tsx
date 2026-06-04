
import React, { useState, useEffect, useContext } from 'react';
import { FileViewInfoContext } from '@/contexts/FileViewInfoContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { 
  MoreVertical, 
  Eye, 
  Share2, 
  Info, 
  Trash2, 
  Download,
  Copy,
  ExternalLink,
  XCircle,
  Shield,
  Undo2,
  Settings,
  Archive,
  Code2,
  AlertTriangle
} from '@/lib/icon-map';
import { useToast } from '@/hooks/use-toast';
import { isFeatureEnabled } from '@/hooks/useFeatureFlags';
import { createFileShare, revokeFileShare, getFileShareId } from '@/lib/api';
import ShareManagementDialog from './ShareManagementDialog';
import { EnhancedShareDialog } from './EnhancedShareDialog';
import ExtractionDialog from './ExtractionDialog';
import { isNativePlatform, haptics } from '@/utils/mobile';
import { shareLink, canShare } from '@/services/mobileShareService';
import { buildPublicUrl } from '@/lib/appLinks';

const sharingEnabled = isFeatureEnabled('sharing')

interface FileActionMenuProps {
  file: {
    id: string;
    name: string;
    type: string;
    size: number;
  };
  onView?: () => void;
  onShare?: () => void;
  onViewInfo?: (file: any) => void;
  onDelete?: () => void;
  onDownload?: () => void;
  onMoveToVault?: (file: any) => void;
  onRemoveFromVault?: (file: any) => void;
  showVaultActions?: boolean;
  trigger?: React.ReactNode;
  onShareRevoked?: (fileId: string) => void;
  onShareChange?: (fileId: string) => void;
  onExtract?: () => void;
  onOpenInCbCode?: () => void;
}

const FileActionMenu: React.FC<FileActionMenuProps> = ({
  file,
  onView,
  onShare,
  onViewInfo,
  onDelete,
  onDownload,
  onMoveToVault,
  onRemoveFromVault,
  showVaultActions = false,
  trigger,
  onShareRevoked,
  onShareChange,
  onExtract,
  onOpenInCbCode
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showEnhancedShareDialog, setShowEnhancedShareDialog] = useState(false);
  const [showExtractionDialog, setShowExtractionDialog] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const { toast } = useToast();
  const contextOnViewInfo = useContext(FileViewInfoContext);
  const activeOnViewInfo = onViewInfo || contextOnViewInfo;

  // Check if file is an archive
  const isArchive = /\.(zip|rar|7z|tar|gz|tgz|bz2|tar\.gz|tar\.bz2)$/i.test(file.name);

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
        // Gracefully handle errors - assume not shared
        setIsShared(false);
        setShareUrl(null);
      }
    };

    checkShareStatus();
  }, [file.id]);

  const handleCopyLink = () => {
    const fileUrl = buildPublicUrl(`/file/${file.id}`);
    navigator.clipboard.writeText(fileUrl).then(() => {
      toast({
        title: "Link copied",
        description: "File link has been copied to clipboard",
      });
    }).catch(() => {
      toast({
        title: "Copy failed",
        description: "Failed to copy file link",
        variant: "destructive",
      });
    });
    setIsOpen(false);
  };

  const handleShare = () => {
    setIsOpen(false);
    setShowEnhancedShareDialog(true);
  };

  const handleRevokeShare = async () => {
    if (loading) return;
    
    try {
      setLoading(true);
      
      const success = await revokeFileShare(file.id);
      if (success) {
        setIsShared(false);
        setShareUrl(null);
        
        // Notify parent component
        if (onShareRevoked) {
          onShareRevoked(file.id);
        }
        
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
      setIsOpen(false);
    }
  };

  const handleAction = (action: (() => void) | undefined, actionName: string = '') => {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      console.log(`FileActionMenu: ${actionName} clicked`);
      
      // Close dropdown first to prevent any further events
      setIsOpen(false);
      
      // Small delay to ensure dropdown is closed before executing action
      setTimeout(() => {
        if (action) {
          action();
        }
      }, 50);
    };
  };

  return (
    <>
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        {trigger || (
          <Button 
            variant="ghost" 
            className="h-8 w-8 p-0"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <MoreVertical className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="w-48 z-[9999]"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {onView && (
          <DropdownMenuItem onClick={handleAction(onView, 'View')}>
            <Eye className="mr-2 h-4 w-4" />
            View
          </DropdownMenuItem>
        )}
        
        {onDownload && (
          <DropdownMenuItem onClick={handleAction(onDownload, 'Download')}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </DropdownMenuItem>
        )}
        
        <DropdownMenuItem onClick={handleAction(() => handleCopyLink(), 'Copy Link')}>
          <Copy className="mr-2 h-4 w-4" />
          Copy Link
        </DropdownMenuItem>
        
        {sharingEnabled && (
          <DropdownMenuItem onClick={handleAction(() => handleShare(), 'Share')} disabled={loading}>
            <Share2 className="mr-2 h-4 w-4" />
            {loading ? 'Processing...' : isShared ? 'Manage Share' : 'Share File'}
          </DropdownMenuItem>
        )}
        
        {sharingEnabled && isShared && (
          <DropdownMenuItem onClick={handleAction(() => handleRevokeShare(), 'Revoke Share')} disabled={loading}>
            <XCircle className="mr-2 h-4 w-4" />
            {loading ? 'Revoking...' : 'Revoke Share'}
          </DropdownMenuItem>
        )}
        
        <DropdownMenuSeparator />
        
        {sharingEnabled && (
          <DropdownMenuItem onClick={handleAction(() => {
            setShowShareDialog(true);
          }, 'Manage All Shares')}>
            <Settings className="mr-2 h-4 w-4" />
            Manage All Shares
          </DropdownMenuItem>
        )}
        
        <DropdownMenuItem onClick={handleAction(() => {
          window.open(`/file/${file.id}`, '_blank');
        }, 'Open in New Tab')}>
          <ExternalLink className="mr-2 h-4 w-4" />
          Open in New Tab
        </DropdownMenuItem>

        {onOpenInCbCode && (
          <DropdownMenuItem onClick={handleAction(onOpenInCbCode, 'Open in cbCode')}>
            <Code2 className="mr-2 h-4 w-4" />
            Open in cbCode
          </DropdownMenuItem>
        )}
        
        {/* Extract Archive - shown only for archive files */}
        {isArchive && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleAction(() => {
              if (onExtract) {
                onExtract();
              } else {
                setShowExtractionDialog(true);
              }
            }, 'Extract Archive')}>
              <Archive className="mr-2 h-4 w-4" />
              Extract Archive
            </DropdownMenuItem>
          </>
        )}
        
        <DropdownMenuSeparator />
        
        {activeOnViewInfo && (
          <DropdownMenuItem onClick={handleAction(() => activeOnViewInfo(file), 'File Info')}>
            <Info className="mr-2 h-4 w-4" />
            File Info
          </DropdownMenuItem>
        )}

        {/* Vault Actions */}
        {showVaultActions && onRemoveFromVault && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleAction(() => onRemoveFromVault(file), 'Remove from Vault')}>
              <Undo2 className="mr-2 h-4 w-4" />
              Remove from Vault
            </DropdownMenuItem>
          </>
        )}
        
        {!showVaultActions && onMoveToVault && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleAction(() => onMoveToVault(file), 'Move to Vault')}>
              <Shield className="mr-2 h-4 w-4" />
              Move to Vault
            </DropdownMenuItem>
          </>
        )}
        
        <DropdownMenuSeparator />
        
        {onDelete && (
          <DropdownMenuItem 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsOpen(false);
              setTimeout(() => setDeleteConfirmOpen(true), 50);
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>

    <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete file?
          </AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{file.name}</strong> will be moved to trash. You can restore it from the Trash tab later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setDeleteConfirmOpen(false); onDelete?.(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    
    <ShareManagementDialog 
      open={showShareDialog} 
      onOpenChange={setShowShareDialog}
    />
    
    <EnhancedShareDialog
      open={showEnhancedShareDialog}
      onClose={() => setShowEnhancedShareDialog(false)}
      onShareChange={() => onShareChange && onShareChange(file.id)}
      file={file}
    />
    
    {/* Extraction Dialog */}
    {showExtractionDialog && (
      <ExtractionDialog
        open={showExtractionDialog}
        onClose={() => setShowExtractionDialog(false)}
        file={file}
        onExtractionComplete={onExtract}
      />
    )}
    </>
  );
};

export default FileActionMenu;
