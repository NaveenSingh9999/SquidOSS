import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { 
  Download, 
  Pause, 
  Play, 
  X, 
  FileDown, 
  CheckCircle, 
  AlertCircle, 
  MoreVertical, 
  Trash2, 
  Archive, 
  History, 
  FileText, 
  Image, 
  Video, 
  Music, 
  File, 
  RefreshCw,
  FolderDown
} from '@/lib/icon-map';
import { useToast } from '@/hooks/use-toast';
import { downloadFile, FileItem as FileItemType, formatBytes } from '@/lib/api';
import JSZip from 'jszip';

export interface DownloadTask {
  id: string;
  file: FileItemType;
  status: 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  speed?: number; // bytes per second
  timeRemaining?: number; // seconds
  error?: string;
  startTime?: number;
  completedTime?: number;
  retryCount: number;
}

interface DownloadManagerProps {
  onDownloadStart?: (fileId: string) => void;
  onDownloadComplete?: (fileId: string) => void;
  onDownloadFailed?: (fileId: string, error: string) => void;
}

const DownloadManager = React.forwardRef<
  {
    addDownload: (file: FileItemType) => string;
    addBatchDownload: (files: FileItemType[], createZip?: boolean) => string | string[];
  },
  DownloadManagerProps
>(({
  onDownloadStart,
  onDownloadComplete,
  onDownloadFailed,
}, ref) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);
  const [downloadHistory, setDownloadHistory] = useState<DownloadTask[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [maxConcurrentDownloads, setMaxConcurrentDownloads] = useState(3);
  const [activeDownloads, setActiveDownloads] = useState(0);

  // Load download history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('downloadHistory');
    if (savedHistory) {
      try {
        const history = JSON.parse(savedHistory);
        setDownloadHistory(history);
      } catch (error) {
        console.error('Error loading download history:', error);
      }
    }
  }, []);

  // Save download history to localStorage
  useEffect(() => {
    localStorage.setItem('downloadHistory', JSON.stringify(downloadHistory));
  }, [downloadHistory]);

  // Process download queue
  useEffect(() => {
    const queuedDownloads = downloads.filter(d => d.status === 'queued');
    const activeCount = downloads.filter(d => d.status === 'downloading').length;
    
    setActiveDownloads(activeCount);
    
    if (queuedDownloads.length > 0 && activeCount < maxConcurrentDownloads) {
      const nextDownload = queuedDownloads[0];
      startDownload(nextDownload.id);
    }
  }, [downloads, maxConcurrentDownloads]);

  const addDownload = useCallback((file: FileItemType) => {
    const existingDownload = downloads.find(d => d.file.id === file.id && d.status !== 'completed');
    
    if (existingDownload) {
      toast({
        title: 'Download Already in Progress',
        description: `${file.name} is already being downloaded`,
        variant: 'default',
      });
      return existingDownload.id;
    }

    const downloadTask: DownloadTask = {
      id: `download_${Date.now()}_${file.id}`,
      file,
      status: 'queued',
      progress: 0,
      retryCount: 0,
    };

    setDownloads(prev => [...prev, downloadTask]);
    
    toast({
      title: 'Download Added',
      description: `${file.name} added to download queue`,
    });

    onDownloadStart?.(file.id);
    return downloadTask.id;
  }, [downloads, onDownloadStart, toast]);

  const addBatchDownload = useCallback((files: FileItemType[], createZip = false) => {
    if (createZip && files.length > 1) {
      // Create a single download task for the ZIP file
      const zipFile: FileItemType = {
        id: `batch_${Date.now()}`,
        name: `SquidCloud_Files_${new Date().toISOString().slice(0, 10)}.zip`,
        type: 'application/zip',
        size: files.reduce((total, file) => total + file.size, 0),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: files[0]?.user_id || '',
        storage_path: '',
        encrypted: false,
        shared: false,
        parent_folder: null,
        tags: [],
      };

      const downloadTask: DownloadTask = {
        id: `batch_download_${Date.now()}`,
        file: zipFile,
        status: 'queued',
        progress: 0,
        retryCount: 0,
      };

      setDownloads(prev => [...prev, downloadTask]);
      
      toast({
        title: 'Batch Download Added',
        description: `${files.length} files will be downloaded as a ZIP`,
      });

      return downloadTask.id;
    } else {
      // Add individual downloads
      const downloadIds = files.map(file => addDownload(file));
      
      toast({
        title: 'Batch Downloads Added',
        description: `${files.length} files added to download queue`,
      });

      return downloadIds;
    }
  }, [addDownload, toast]);

  // Expose API for external use
  React.useImperativeHandle(ref, () => ({
    addDownload,
    addBatchDownload
  }), [addDownload, addBatchDownload]);

  const startDownload = async (downloadId: string) => {
    const downloadIndex = downloads.findIndex(d => d.id === downloadId);
    if (downloadIndex === -1) return;

    const download = downloads[downloadIndex];
    
    setDownloads(prev => prev.map(d => 
      d.id === downloadId 
        ? { ...d, status: 'downloading', startTime: Date.now() }
        : d
    ));

    try {
      // Check if this is a batch download
      if (download.file.id.startsWith('batch_')) {
        await handleBatchDownload(download);
      } else {
        await handleSingleDownload(download);
      }
    } catch (error: any) {
      console.error('Download failed:', error);
      
      setDownloads(prev => prev.map(d => 
        d.id === downloadId 
          ? { ...d, status: 'failed', error: error.message }
          : d
      ));

      onDownloadFailed?.(download.file.id, error.message);
      
      // Move to history
      moveToHistory(downloadId);
    }
  };

  const handleSingleDownload = async (download: DownloadTask) => {
    const startTime = Date.now();
    let lastProgressTime = startTime;
    let lastProgressBytes = 0;

    try {
      const fileBlob = await downloadFile(download.file.id, (progress, stage) => {
        const now = Date.now();
        const progressBytes = (progress / 100) * download.file.size;
        
        // Calculate download speed
        const timeDiff = (now - lastProgressTime) / 1000; // seconds
        const bytesDiff = progressBytes - lastProgressBytes;
        const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;
        
        // Calculate time remaining
        const remainingBytes = download.file.size - progressBytes;
        const timeRemaining = speed > 0 ? remainingBytes / speed : 0;
        
        setDownloads(prev => prev.map(d => 
          d.id === download.id 
            ? { 
                ...d, 
                progress, 
                speed: speed > 0 ? speed : d.speed,
                timeRemaining: timeRemaining > 0 ? timeRemaining : d.timeRemaining
              }
            : d
        ));

        lastProgressTime = now;
        lastProgressBytes = progressBytes;
      });

      // Create download link
      const url = URL.createObjectURL(fileBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = download.file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Mark as completed
      setDownloads(prev => prev.map(d => 
        d.id === download.id 
          ? { 
              ...d, 
              status: 'completed', 
              progress: 100, 
              completedTime: Date.now()
            }
          : d
      ));

      toast({
        title: 'Download Complete',
        description: `${download.file.name} has been downloaded`,
      });

      onDownloadComplete?.(download.file.id);
      
      // Move to history after a delay
      setTimeout(() => moveToHistory(download.id), 2000);

    } catch (error) {
      throw error;
    }
  };

  const handleBatchDownload = async (download: DownloadTask) => {
    // This would need to be implemented based on how batch downloads are handled
    // For now, simulate the download
    const totalSteps = 100;
    
    for (let i = 0; i <= totalSteps; i++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      
      setDownloads(prev => prev.map(d => 
        d.id === download.id 
          ? { ...d, progress: i }
          : d
      ));
    }

    // Mark as completed
    setDownloads(prev => prev.map(d => 
      d.id === download.id 
        ? { 
            ...d, 
            status: 'completed', 
            progress: 100, 
            completedTime: Date.now()
          }
        : d
    ));

    toast({
      title: 'Batch Download Complete',
      description: `ZIP file has been downloaded`,
    });

    setTimeout(() => moveToHistory(download.id), 2000);
  };

  const pauseDownload = (downloadId: string) => {
    setDownloads(prev => prev.map(d => 
      d.id === downloadId && d.status === 'downloading'
        ? { ...d, status: 'paused' }
        : d
    ));
  };

  const resumeDownload = (downloadId: string) => {
    setDownloads(prev => prev.map(d => 
      d.id === downloadId && d.status === 'paused'
        ? { ...d, status: 'queued' }
        : d
    ));
  };

  const cancelDownload = (downloadId: string) => {
    setDownloads(prev => prev.map(d => 
      d.id === downloadId
        ? { ...d, status: 'cancelled' }
        : d
    ));

    moveToHistory(downloadId);
  };

  const retryDownload = (downloadId: string) => {
    setDownloads(prev => prev.map(d => 
      d.id === downloadId
        ? { ...d, status: 'queued', progress: 0, retryCount: d.retryCount + 1, error: undefined }
        : d
    ));
  };

  const removeDownload = (downloadId: string) => {
    setDownloads(prev => prev.filter(d => d.id !== downloadId));
  };

  const moveToHistory = (downloadId: string) => {
    const download = downloads.find(d => d.id === downloadId);
    if (download) {
      setDownloadHistory(prev => [download, ...prev.slice(0, 99)]); // Keep last 100
      removeDownload(downloadId);
    }
  };

  const clearHistory = () => {
    setDownloadHistory([]);
  };

  const getFileIcon = (file: FileItemType) => {
    if (file.type.startsWith('image/')) return <Image className="h-4 w-4" />;
    if (file.type.startsWith('video/')) return <Video className="h-4 w-4" />;
    if (file.type.startsWith('audio/')) return <Music className="h-4 w-4" />;
    if (file.type.includes('pdf') || file.type.includes('document')) return <FileText className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const getStatusIcon = (status: DownloadTask['status']) => {
    switch (status) {
      case 'downloading': return <Download className="h-4 w-4 text-blue-500" />;
      case 'paused': return <Pause className="h-4 w-4 text-yellow-500" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled': return <X className="h-4 w-4 text-gray-500" />;
      default: return <Download className="h-4 w-4 text-gray-500" />;
    }
  };

  const formatSpeed = (speed?: number) => {
    if (!speed) return '';
    return `${formatBytes(speed)}/s`;
  };

  const formatTimeRemaining = (seconds?: number) => {
    if (!seconds) return '';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  const activeDownloadCount = downloads.filter(d => ['queued', 'downloading', 'paused'].includes(d.status)).length;
  const completedCount = downloads.filter(d => d.status === 'completed').length;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative"
          disabled={activeDownloadCount === 0 && downloadHistory.length === 0}
        >
          <FileDown className="h-4 w-4 mr-2" />
          Downloads
          {activeDownloadCount > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
              {activeDownloadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[500px] sm:w-[600px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5" />
            Download Manager
          </SheetTitle>
          <SheetDescription>
            Manage your downloads and view download history
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Header with tabs */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant={!showHistory ? "default" : "outline"}
                size="sm"
                onClick={() => setShowHistory(false)}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Active ({activeDownloadCount})
              </Button>
              <Button
                variant={showHistory ? "default" : "outline"}
                size="sm"
                onClick={() => setShowHistory(true)}
                className="flex items-center gap-2"
              >
                <History className="h-4 w-4" />
                History ({downloadHistory.length})
              </Button>
            </div>
            
            {showHistory && downloadHistory.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearHistory}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>
            )}
          </div>

          {/* Content */}
          <ScrollArea className="h-[500px] pr-4">
            {!showHistory ? (
              // Active downloads
              <div className="space-y-3">
                {downloads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Download className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Active Downloads</h3>
                    <p className="text-muted-foreground">
                      Downloads will appear here when you start downloading files
                    </p>
                  </div>
                ) : (
                  downloads.map((download) => (
                    <Card key={download.id} className="p-4">
                      <div className="space-y-3">
                        {/* File info */}
                        <div className="flex items-start gap-3">
                          <div className="mt-1">
                            {getFileIcon(download.file)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium truncate">{download.file.name}</h4>
                              {getStatusIcon(download.status)}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                              <span>{formatBytes(download.file.size)}</span>
                              {download.speed && (
                                <span>{formatSpeed(download.speed)}</span>
                              )}
                              {download.timeRemaining && (
                                <span>ETA: {formatTimeRemaining(download.timeRemaining)}</span>
                              )}
                            </div>
                          </div>
                          
                          {/* Actions menu */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {download.status === 'downloading' && (
                                <DropdownMenuItem onClick={() => pauseDownload(download.id)}>
                                  <Pause className="h-4 w-4 mr-2" />
                                  Pause
                                </DropdownMenuItem>
                              )}
                              {download.status === 'paused' && (
                                <DropdownMenuItem onClick={() => resumeDownload(download.id)}>
                                  <Play className="h-4 w-4 mr-2" />
                                  Resume
                                </DropdownMenuItem>
                              )}
                              {download.status === 'failed' && (
                                <DropdownMenuItem onClick={() => retryDownload(download.id)}>
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                  Retry
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => cancelDownload(download.id)}
                                className="text-destructive"
                              >
                                <X className="h-4 w-4 mr-2" />
                                {download.status === 'completed' ? 'Remove' : 'Cancel'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Progress bar */}
                        {download.status !== 'completed' && (
                          <div className="space-y-2">
                            <Progress value={download.progress} className="h-2" />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{download.progress.toFixed(1)}%</span>
                              <span className="capitalize">{download.status}</span>
                            </div>
                          </div>
                        )}

                        {/* Error message */}
                        {download.error && (
                          <div className="bg-destructive/10 text-destructive text-sm p-2 rounded">
                            {download.error}
                          </div>
                        )}
                      </div>
                    </Card>
                  ))
                )}
              </div>
            ) : (
              // Download history
              <div className="space-y-3">
                {downloadHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <History className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Download History</h3>
                    <p className="text-muted-foreground">
                      Completed downloads will appear here
                    </p>
                  </div>
                ) : (
                  downloadHistory.map((download) => (
                    <Card key={download.id} className="p-4 opacity-75">
                      <div className="flex items-center gap-3">
                        <div>{getFileIcon(download.file)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium truncate">{download.file.name}</h4>
                            {getStatusIcon(download.status)}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                            <span>{formatBytes(download.file.size)}</span>
                            {download.completedTime && (
                              <span>
                                Completed {new Date(download.completedTime).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            )}
          </ScrollArea>

          {/* Footer with settings */}
          {!showHistory && downloads.length > 0 && (
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {activeDownloads} of {maxConcurrentDownloads} active slots
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Max concurrent:</span>
                  <select
                    value={maxConcurrentDownloads}
                    onChange={(e) => setMaxConcurrentDownloads(Number(e.target.value))}
                    className="border rounded px-2 py-1 text-sm"
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={5}>5</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
});

DownloadManager.displayName = 'DownloadManager';

export default DownloadManager;