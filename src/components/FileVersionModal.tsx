import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { History, Download, RotateCcw, Clock } from '@/lib/icon-map';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface FileVersion {
  id: string;
  version_number: number;
  storage_path: string;
  size: number;
  created_at: string;
  change_description?: string;
  is_current: boolean;
}

interface FileVersionModalProps {
  fileId: string;
  fileName: string;
  open: boolean;
  onClose: () => void;
}

const FileVersionModal: React.FC<FileVersionModalProps> = ({
  fileId,
  fileName,
  open,
  onClose,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && fileId) {
      fetchVersions();
    }
  }, [open, fileId]);

  const fetchVersions = async () => {
    setLoading(true);
    try {
      // File versions table doesn't exist yet - return empty for now
      setVersions([]);
    } catch (error) {
      console.error('Error fetching file versions:', error);
      toast({
        title: "Error",
        description: "Failed to load file versions.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const rollbackToVersion = async (versionId: string, versionNumber: number) => {
    toast({
      title: "Coming Soon",
      description: "File versioning will be available in a future update.",
    });
  };

  const downloadVersion = async (version: FileVersion) => {
    try {
      // Create a download record
      const { data: downloadData, error: downloadError } = await supabase
        .from('downloads')
        .insert({
          user_id: user?.id,
          file_id: fileId,
          total_bytes: version.size,
          status: 'queued'
        })
        .select()
        .single();

      if (downloadError) throw downloadError;

      toast({
        title: "Download Started",
        description: `Version ${version.version_number} download has been queued.`,
      });
    } catch (error) {
      console.error('Error starting download:', error);
      toast({
        title: "Error",
        description: "Failed to start download.",
        variant: "destructive",
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const truncateFileName = (name: string, maxLength: number = 30) => {
    return name.length > maxLength ? `${name.slice(0, maxLength)}...` : name;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History - {truncateFileName(fileName)}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-8">
              <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No Version History</h3>
              <p className="text-muted-foreground">
                This file doesn't have any version history yet.
              </p>
            </div>
          ) : (
            versions.map((version, index) => (
              <Card key={version.id} className={`transition-all hover:shadow-md ${version.is_current ? 'ring-2 ring-primary' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-medium">Version {version.version_number}</h4>
                        {version.is_current && (
                          <Badge variant="default">Current</Badge>
                        )}
                        {index === 0 && !version.is_current && (
                          <Badge variant="secondary">Latest</Badge>
                        )}
                      </div>
                      
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          {format(new Date(version.created_at), 'MMM d, yyyy at h:mm a')}
                        </div>
                        <div>Size: {formatFileSize(version.size)}</div>
                        {version.change_description && (
                          <div>Changes: {version.change_description}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadVersion(version)}
                        className="flex items-center gap-1"
                      >
                        <Download className="h-3 w-3" />
                        Download
                      </Button>
                      {!version.is_current && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Are you sure you want to rollback to version ${version.version_number}? This will make it the current version.`)) {
                              rollbackToVersion(version.id, version.version_number);
                            }
                          }}
                          className="flex items-center gap-1"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Rollback
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FileVersionModal;