
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { 
  Folder, 
  File, 
  ChevronLeft, 
  Download, 
  Loader2,
  CheckCircle,
  ArrowLeft
} from '@/lib/icon-map';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CloudFile {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size: number;
  created: string;
  path?: string;
  downloadUrl?: string;
  mimeType?: string;
}

interface CloudFileBrowserProps {
  jobId: string;
  platform: string;
  onImportComplete: () => void;
  onBack: () => void;
}

const CloudFileBrowser: React.FC<CloudFileBrowserProps> = ({ 
  jobId, 
  platform, 
  onImportComplete, 
  onBack 
}) => {
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [currentPath, setCurrentPath] = useState<string>('');
  const [pathHistory, setPathHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    loadFiles(currentPath);
  }, [currentPath]);

  const loadFiles = async (path: string = '') => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('cloud-file-browser', {
        body: { jobId, path, action: 'list' }
      });

      if (error) throw error;
      setFiles(data.files || []);
    } catch (error: any) {
      toast({
        title: "Error loading files",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const navigateToFolder = (folderId: string, folderName: string) => {
    setPathHistory([...pathHistory, currentPath]);
    setCurrentPath(folderId);
  };

  const navigateBack = () => {
    if (pathHistory.length > 0) {
      const previousPath = pathHistory[pathHistory.length - 1];
      setPathHistory(pathHistory.slice(0, -1));
      setCurrentPath(previousPath);
    }
  };

  const toggleFileSelection = (fileId: string) => {
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(fileId)) {
      newSelection.delete(fileId);
    } else {
      newSelection.add(fileId);
    }
    setSelectedFiles(newSelection);
  };

  const selectAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map(f => f.id)));
    }
  };

  const startImport = async () => {
    if (selectedFiles.size === 0) {
      toast({
        title: "No files selected",
        description: "Please select files to import",
        variant: "destructive"
      });
      return;
    }

    setImporting(true);
    setImportProgress(0);

    try {
      const selectedFilesList = files.filter(f => selectedFiles.has(f.id));
      
      const { data, error } = await supabase.functions.invoke('start-cloud-import', {
        body: {
          jobId,
          selectedFiles: selectedFilesList,
          platform
        }
      });

      if (error) throw error;

      // Poll for progress
      const pollInterval = setInterval(async () => {
        const { data: jobData } = await supabase
          .from('migration_jobs')
          .select('*')
          .eq('id', jobId)
          .single();

        if (jobData) {
          const progress = jobData.total_files > 0 
            ? (jobData.processed_files / jobData.total_files) * 100 
            : 0;
          setImportProgress(progress);

          if (jobData.status === 'completed') {
            clearInterval(pollInterval);
            setImporting(false);
            toast({
              title: "Import completed",
              description: `Successfully imported ${jobData.processed_files} files`
            });
            onImportComplete();
          } else if (jobData.status === 'failed') {
            clearInterval(pollInterval);
            setImporting(false);
            toast({
              title: "Import failed",
              description: jobData.error_message || "Unknown error occurred",
              variant: "destructive"
            });
          }
        }
      }, 2000);

    } catch (error: any) {
      setImporting(false);
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive"
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

  if (importing) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Importing Files from {platform}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={importProgress} className="w-full" />
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Importing {selectedFiles.size} files... {Math.round(importProgress)}% complete
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {platform === 'google-drive' && 'Google Drive'}
            {platform === 'dropbox' && 'Dropbox'}
            {platform === 'onedrive' && 'OneDrive'}
            Browser
          </CardTitle>
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Migration
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          {pathHistory.length > 0 && (
            <Button variant="ghost" size="sm" onClick={navigateBack}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedFiles.size === files.length && files.length > 0}
              onCheckedChange={selectAll}
            />
            <span className="text-sm">
              {selectedFiles.size} of {files.length} selected
            </span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading files...
          </div>
        ) : (
          <div className="space-y-2">
            {files.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No files found in this location
              </p>
            ) : (
              files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-accent/50 cursor-pointer"
                  onClick={() => {
                    if (file.type === 'folder') {
                      navigateToFolder(file.id, file.name);
                    } else {
                      // Directly open preview modal (no selection)
                      // You may need to implement showPreviewModal(file) or similar
                      if (typeof window !== 'undefined' && window.dispatchEvent) {
                        window.dispatchEvent(new CustomEvent('open-file-preview', { detail: file }));
                      }
                    }
                  }}
                >
                  {file.type === 'file' && (
                    <Checkbox
                      checked={selectedFiles.has(file.id)}
                      onCheckedChange={() => toggleFileSelection(file.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  {file.type === 'folder' ? (
                    <Folder className="h-5 w-5 text-blue-500" />
                  ) : (
                    <File className="h-5 w-5 text-gray-500" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {file.type === 'file' && `${formatFileSize(file.size)} • `}
                      {new Date(file.created).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        
        {selectedFiles.size > 0 && (
          <div className="mt-4 pt-4 border-t">
            <Button onClick={startImport} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Import {selectedFiles.size} Selected Files
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CloudFileBrowser;
