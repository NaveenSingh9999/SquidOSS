import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Share2, XCircle, Copy, ExternalLink, Eye, Download as DownloadIcon, RefreshCw } from '@/lib/icon-map';
import { formatFileSize } from '@/lib/utils';
import { revokeFileShare } from '@/lib/api';
import { buildPublicUrl } from '@/lib/appLinks';

interface SharedFile {
  id: string;
  file_id: string;
  share_id: string;
  created_at: string;
  expires_at: string | null;
  share_views: number;
  download_count: number;
  is_active: boolean;
  file: {
    id: string;
    name: string;
    type: string;
    size: number;
  };
}

interface ShareManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ShareManagementDialog: React.FC<ShareManagementDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchSharedFiles();
    }
  }, [open]);

  const fetchSharedFiles = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('shares')
        .select(`
          id,
          file_id,
          share_id,
          created_at,
          expires_at,
          share_views,
          download_count,
          is_active,
          file:files(id, name, type, size)
        `)
        .eq('user_id', user.id)
        .not('share_id', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setSharedFiles(data as any || []);
    } catch (error: any) {
      console.error('Failed to fetch shared files:', error);
      toast({
        title: "Failed to load shares",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyShareLink = async (shareId: string, fileName: string) => {
    const shareUrl = buildPublicUrl(`/s/${shareId}`);
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: "Share link copied",
        description: `Link for "${fileName}" copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Failed to copy share link",
        variant: "destructive",
      });
    }
  };

  const handleRevokeShare = async (fileId: string, fileName: string) => {
    try {
      const success = await revokeFileShare(fileId);
      if (success) {
        toast({
          title: "Share revoked",
          description: `Share for "${fileName}" has been disabled`,
        });
        fetchSharedFiles(); // Refresh the list
      }
    } catch (error: any) {
      toast({
        title: "Revoke failed",
        description: error.message || "Failed to revoke share",
        variant: "destructive",
      });
    }
  };

  const openShareLink = (shareId: string) => {
    window.open(buildPublicUrl(`/s/${shareId}`), '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Manage Shared Files
          </DialogTitle>
          <DialogDescription>
            View and manage all your shared files ({sharedFiles.length} total)
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <div className="flex justify-end mb-3">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchSharedFiles}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {loading && sharedFiles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw className="h-12 w-12 mx-auto mb-4 opacity-20 animate-spin" />
              <p>Loading shared files...</p>
            </div>
          ) : sharedFiles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Share2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No shared files yet</p>
              <p className="text-sm mt-2">Share files by clicking the three-dot menu on any file</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sharedFiles.map((share) => (
                <div
                  key={share.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium truncate">{share.file.name}</h4>
                      {share.is_active ? (
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 shrink-0">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-500/10 text-gray-600 border-gray-500/20 shrink-0">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span>{formatFileSize(share.file.size)}</span>
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {share.share_views || 0} views
                      </span>
                      <span className="flex items-center gap-1">
                        <DownloadIcon className="h-3 w-3" />
                        {share.download_count || 0} downloads
                      </span>
                      {share.expires_at && (
                        <span className="text-orange-600">
                          Expires: {new Date(share.expires_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyShareLink(share.share_id, share.file.name)}
                      title="Copy share link"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openShareLink(share.share_id)}
                      title="Open share link"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevokeShare(share.file_id, share.file.name)}
                      title="Revoke share"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareManagementDialog;
