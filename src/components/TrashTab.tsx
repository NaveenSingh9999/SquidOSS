import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, RotateCcw, Clock, AlertTriangle } from '@/lib/icon-map';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { getActiveWorkspaceId } from '@/lib/api';

interface TrashedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  deleted_at: string;
  original_parent_folder: string;
}

interface TrashTabProps {
  workspaceId?: string | null;
}

const TrashTab: React.FC<TrashTabProps> = ({ workspaceId }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [trashedFiles, setTrashedFiles] = useState<TrashedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const activeWorkspaceId = workspaceId ?? getActiveWorkspaceId();

  useEffect(() => {
    if (user) {
      fetchTrashedFiles();
    }
  }, [user, activeWorkspaceId]);

  const fetchTrashedFiles = async () => {
    try {
      let query: any = supabase
        .from('files')
        .select('id, name, type, size, deleted_at, original_parent_folder')
        .eq('is_deleted', true)
        .order('deleted_at', { ascending: false });

      if (activeWorkspaceId) {
        query = query.eq('workspace_id', activeWorkspaceId);
      } else {
        query = query.eq('user_id', user?.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setTrashedFiles(data || []);
    } catch (error) {
      console.error('Error fetching trashed files:', error);
      toast({
        title: "Error",
        description: "Failed to load trashed files.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const restoreFile = async (fileId: string) => {
    try {
      const { error } = await supabase.rpc('restore_from_trash', {
        file_uuid: fileId
      });

      if (error) throw error;

      toast({
        title: "File Restored",
        description: "File has been restored to its original location.",
      });

      fetchTrashedFiles();
    } catch (error) {
      console.error('Error restoring file:', error);
      toast({
        title: "Error",
        description: "Failed to restore file.",
        variant: "destructive",
      });
    }
  };

  const permanentDelete = async (fileId: string) => {
    try {
      const { error } = await supabase
        .from('files')
        .delete()
        .eq('id', fileId);

      if (error) throw error;

      toast({
        title: "File Permanently Deleted",
        description: "File has been permanently removed.",
      });

      fetchTrashedFiles();
    } catch (error) {
      console.error('Error permanently deleting file:', error);
      toast({
        title: "Error",
        description: "Failed to permanently delete file.",
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

  const getDaysUntilDeletion = (deletedAt: string) => {
    const deleteDate = new Date(deletedAt);
    const expiryDate = new Date(deleteDate.getTime() + (30 * 24 * 60 * 60 * 1000));
    const now = new Date();
    const diffTime = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Trash</h2>
          <p className="text-muted-foreground">Files are automatically deleted after 30 days</p>
        </div>
        {trashedFiles.length > 0 && (
          <Badge variant="secondary" className="flex items-center gap-2">
            <Trash2 className="h-3 w-3" />
            {trashedFiles.length} files
          </Badge>
        )}
      </div>

      {trashedFiles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Trash2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Trash is empty</h3>
            <p className="text-muted-foreground text-center">
              Deleted files will appear here and can be restored within 30 days.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {trashedFiles.map((file) => {
            const daysLeft = getDaysUntilDeletion(file.deleted_at);
            const isExpiringSoon = daysLeft <= 7;

            return (
              <Card key={file.id} className={`transition-all hover:shadow-md ${isExpiringSoon ? 'border-destructive/50' : ''}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">
                        {file.name.length > 25 ? `${file.name.slice(0, 25)}...` : file.name}
                      </CardTitle>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <span>{formatFileSize(file.size)}</span>
                        <span>Deleted {format(new Date(file.deleted_at), 'MMM d, yyyy')}</span>
                        <span>From: {file.original_parent_folder || 'Root'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {isExpiringSoon && (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {daysLeft} day{daysLeft !== 1 ? 's' : ''} left
                        </Badge>
                      )}
                      {!isExpiringSoon && (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {daysLeft} days left
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => restoreFile(file.id)}
                      className="flex items-center gap-2"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Restore
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm('Are you sure you want to permanently delete this file? This action cannot be undone.')) {
                          permanentDelete(file.id);
                        }
                      }}
                      className="flex items-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Permanently
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TrashTab;