
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Folder, File, ArrowLeft } from '@/lib/icon-map';
import { useToast } from '@/hooks/use-toast';
import { getActiveWorkspaceId } from '@/lib/api';

interface FileItem {
  id: string;
  name: string;
  type: string;
  size: number;
  is_folder?: boolean;
  parent_folder?: string;
}

interface cbCodeFolderViewerProps {
  currentPath?: string;
  onPathChange?: (path: string) => void;
  onFileSelect?: (file: FileItem) => void;
}

const cbCodeFolderViewer: React.FC<cbCodeFolderViewerProps> = ({
  currentPath = "",
  onPathChange,
  onFileSelect
}) => {
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchFolderContents();
  }, [currentPath, user]);

  const fetchFolderContents = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const activeWorkspaceId = getActiveWorkspaceId();
      // Get files from current folder
      let filesQuery = supabase
        .from('files')
        .select('*');

      if (activeWorkspaceId) {
        filesQuery = filesQuery.eq('workspace_id', activeWorkspaceId);
      } else {
        filesQuery = filesQuery.eq('user_id', user.id);
      }

      if (currentPath === "") {
        filesQuery = filesQuery.or('parent_folder.is.null,parent_folder.eq.');
      } else {
        filesQuery = filesQuery.eq('parent_folder', currentPath);
      }

      const { data: files, error: filesError } = await filesQuery;
      
      if (filesError) throw filesError;

      // Get folders from current path
      const { data: folders, error: foldersError } = await supabase
        .from('folders')
        .select('*')
        .eq(activeWorkspaceId ? 'workspace_id' : 'user_id', activeWorkspaceId || user.id);

      if (foldersError) throw foldersError;

      // Filter folders by current path
      const filteredFolders = (folders || []).filter((folder: any) => {
        if (currentPath === "") {
          return !folder.parent_folder || folder.parent_folder === '';
        } else {
          return folder.parent_folder === currentPath;
        }
      });

      // Combine files and folders
      const allItems = [
        ...filteredFolders.map((folder: any) => ({
          id: folder.id,
          name: folder.name,
          type: 'folder',
          size: 0,
          is_folder: true,
          parent_folder: folder.parent_folder
        })),
        ...(files || []).map((file: any) => ({
          id: file.id,
          name: file.name,
          type: file.type,
          size: file.size,
          is_folder: false,
          parent_folder: file.parent_folder
        }))
      ];

      setItems(allItems);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load folder contents",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleItemClick = (item: FileItem) => {
    if (item.is_folder) {
      const newPath = currentPath ? `${currentPath}/${item.name}` : item.name;
      onPathChange?.(newPath);
    } else {
      onFileSelect?.(item);
    }
  };

  const handleGoBack = () => {
    if (currentPath.includes('/')) {
      const parentPath = currentPath.split('/').slice(0, -1).join('/');
      onPathChange?.(parentPath);
    } else {
      onPathChange?.("");
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {currentPath && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleGoBack}
              className="p-1"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <CardTitle className="text-sm">
            {currentPath || "Root Folder"}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            No files or folders found
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer border-b last:border-b-0"
                onClick={() => handleItemClick(item)}
              >
                {item.is_folder ? (
                  <Folder className="w-4 h-4 text-blue-500" />
                ) : (
                  <File className="w-4 h-4 text-gray-500" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {item.name}
                  </div>
                  {!item.is_folder && (
                    <div className="text-xs text-muted-foreground">
                      {formatFileSize(item.size)} • {item.type}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default cbCodeFolderViewer;
