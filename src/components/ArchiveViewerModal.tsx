import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  FileText, Folder, Image, Video, Music, 
  File, Archive, X, Download, Eye,
  ChevronRight, ChevronDown, Loader2
} from '@/lib/icon-map';
import { formatBytes } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface ArchiveEntry {
  name: string;
  path: string;
  dir: boolean;
  size: number;
  date: Date | null;
}

interface ArchiveViewerModalProps {
  open: boolean;
  onClose: () => void;
  file: {
    id: string;
    name: string;
    url?: string;
  } | null;
  onDownload?: (file: any) => void;
}

const ArchiveViewerModal: React.FC<ArchiveViewerModalProps> = ({
  open,
  onClose,
  file,
  onDownload,
}) => {
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [currentPath, setCurrentPath] = useState('');
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>('');
  const { toast } = useToast();

  const loadArchive = useCallback(async () => {
    if (!file?.url) return;
    
    setLoading(true);
    setError(null);
    setEntries([]);
    
    try {
      // Dynamically import JSZip
      const JSZip = (await import('jszip')).default;
      
      // Fetch the archive file
      const response = await fetch(file.url);
      if (!response.ok) {
        throw new Error('Failed to fetch archive');
      }
      
      const blob = await response.blob();
      const zip = await JSZip.loadAsync(blob);
      
      const archiveEntries: ArchiveEntry[] = [];
      
      zip.forEach((relativePath, zipEntry) => {
        archiveEntries.push({
          name: zipEntry.name.split('/').filter(Boolean).pop() || zipEntry.name,
          path: relativePath,
          dir: zipEntry.dir,
          size: (zipEntry as any)._data?.uncompressedSize || 0,
          date: zipEntry.date,
        });
      });
      
      // Sort: folders first, then files
      archiveEntries.sort((a, b) => {
        if (a.dir && !b.dir) return -1;
        if (!a.dir && b.dir) return 1;
        return a.path.localeCompare(b.path);
      });
      
      setEntries(archiveEntries);
    } catch (err) {
      console.error('Failed to load archive:', err);
      setError('Failed to load archive contents. The file may be corrupted or not a valid archive.');
    } finally {
      setLoading(false);
    }
  }, [file?.url]);

  useEffect(() => {
    if (open && file) {
      loadArchive();
      setCurrentPath('');
      setExpandedFolders(new Set());
      setPreviewContent(null);
    }
  }, [open, file, loadArchive]);

  const getFileIcon = (name: string, isDir: boolean) => {
    if (isDir) {
      return <Folder className="h-4 w-4 text-blue-400" />;
    }
    
    const ext = name.split('.').pop()?.toLowerCase() || '';
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
      return <Image className="h-4 w-4 text-green-500" />;
    }
    if (['mp4', 'webm', 'avi', 'mov', 'mkv'].includes(ext)) {
      return <Video className="h-4 w-4 text-red-500" />;
    }
    if (['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext)) {
      return <Music className="h-4 w-4 text-purple-500" />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return <Archive className="h-4 w-4 text-yellow-600" />;
    }
    if (['txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'css', 'html', 'xml', 'yml', 'yaml'].includes(ext)) {
      return <FileText className="h-4 w-4 text-blue-500" />;
    }
    
    return <File className="h-4 w-4 text-gray-400" />;
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handlePreviewFile = async (entry: ArchiveEntry) => {
    if (!file?.url || entry.dir) return;
    
    const ext = entry.name.split('.').pop()?.toLowerCase() || '';
    const textExtensions = ['txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'css', 'html', 'xml', 'yml', 'yaml', 'csv', 'log'];
    
    if (!textExtensions.includes(ext)) {
      toast({
        title: "Preview not available",
        description: "Only text-based files can be previewed.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const JSZip = (await import('jszip')).default;
      const response = await fetch(file.url);
      const blob = await response.blob();
      const zip = await JSZip.loadAsync(blob);
      
      const content = await zip.file(entry.path)?.async('string');
      if (content) {
        setPreviewContent(content);
        setPreviewName(entry.name);
      }
    } catch (err) {
      console.error('Failed to preview file:', err);
      toast({
        title: "Preview failed",
        description: "Could not read the file content.",
        variant: "destructive",
      });
    }
  };

  // Build a tree structure from flat entries
  const buildTree = (entries: ArchiveEntry[], basePath: string = '') => {
    const directChildren = entries.filter(entry => {
      const relativePath = basePath ? entry.path.replace(basePath, '') : entry.path;
      const parts = relativePath.split('/').filter(Boolean);
      return parts.length === 1 || (parts.length === 0 && entry.dir);
    });

    return directChildren;
  };

  const renderEntry = (entry: ArchiveEntry, depth: number = 0) => {
    const isExpanded = expandedFolders.has(entry.path);
    const childEntries = entry.dir 
      ? entries.filter(e => e.path.startsWith(entry.path) && e.path !== entry.path)
      : [];

    // Get direct children only
    const directChildren = childEntries.filter(child => {
      const relativePath = child.path.replace(entry.path, '');
      const parts = relativePath.split('/').filter(Boolean);
      return parts.length === 1;
    });

    return (
      <div key={entry.path}>
        <div
          className={cn(
            "flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-colors hover:bg-accent/50 group",
            depth > 0 && "ml-4"
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => entry.dir ? toggleFolder(entry.path) : handlePreviewFile(entry)}
        >
          {entry.dir && (
            <button className="p-0.5">
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
          )}
          {!entry.dir && <span className="w-4" />}
          
          {getFileIcon(entry.name, entry.dir)}
          
          <span className="flex-1 text-sm truncate">{entry.name}</span>
          
          {!entry.dir && entry.size > 0 && (
            <span className="text-xs text-muted-foreground">
              {formatBytes(entry.size)}
            </span>
          )}
          
          {!entry.dir && (
            <button
              className="p-1 opacity-0 group-hover:opacity-100 hover:bg-accent rounded transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                handlePreviewFile(entry);
              }}
              title="Preview"
            >
              <Eye className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
        
        {entry.dir && isExpanded && directChildren.map(child => renderEntry(child, depth + 1))}
      </div>
    );
  };

  // Get root level entries
  const rootEntries = entries.filter(entry => {
    const parts = entry.path.split('/').filter(Boolean);
    return parts.length === 1;
  });

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-yellow-600" />
            {file?.name || 'Archive Viewer'}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading archive...</span>
          </div>
        )}

        {error && (
          <div className="py-8 text-center">
            <Archive className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-destructive">{error}</p>
            <Button variant="outline" className="mt-4" onClick={loadArchive}>
              Try Again
            </Button>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <div className="flex flex-1 gap-4 min-h-0">
            {/* File Tree */}
            <ScrollArea className="flex-1 border rounded-lg">
              <div className="p-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 mb-1">
                  Contents ({entries.length} items)
                </div>
                {rootEntries.map(entry => renderEntry(entry))}
              </div>
            </ScrollArea>

            {/* Preview Panel */}
            {previewContent !== null && (
              <div className="w-1/2 border rounded-lg flex flex-col">
                <div className="flex items-center justify-between p-2 border-b bg-muted/50">
                  <span className="text-sm font-medium truncate">{previewName}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setPreviewContent(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <ScrollArea className="flex-1 p-3">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                    {previewContent}
                  </pre>
                </ScrollArea>
              </div>
            )}
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="py-8 text-center">
            <Archive className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No files found in archive</p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          {file && onDownload && (
            <Button
              variant="outline"
              onClick={() => onDownload(file)}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Download Archive
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ArchiveViewerModal;
