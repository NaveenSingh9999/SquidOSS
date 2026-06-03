/**
 * SmartDropZone - Enhanced drag-and-drop upload zone
 * 
 * Features:
 * - Beautiful animated drop zone
 * - File type validation
 * - Size limit enforcement
 * - Multiple file support
 * - Folder upload support
 * - Quick upload preview
 * - Integrity checksum calculation
 * - Integration with SmartTransferQueue
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  Upload,
  FileIcon,
  Image,
  Video,
  Music,
  FileText,
  Archive,
  AlertCircle,
  X,
  Check,
  Plus,
  FolderUp,
  Shield
} from '@/lib/icon-map';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { smartTransferQueue } from '@/services/SmartTransferQueue';
import { calculateFileChecksum } from '@/hooks/use-transfer-integrity';
import { useToast } from '@/hooks/use-toast';

interface FilePreview {
  id: string;
  file: File;
  preview?: string;
  checksum?: string;
  isCalculatingChecksum: boolean;
  checksumProgress: number;
  error?: string;
}

interface SmartDropZoneProps {
  currentFolder?: string;
  onUploadStart?: (files: File[]) => void;
  onUploadComplete?: () => void;
  maxFileSize?: number; // bytes
  allowedTypes?: string[]; // MIME types or extensions
  maxFiles?: number;
  showPreviews?: boolean;
  className?: string;
}

// Format file size
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

// Get icon for file type
const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return Image;
  if (type.startsWith('video/')) return Video;
  if (type.startsWith('audio/')) return Music;
  if (type.startsWith('text/') || type.includes('document')) return FileText;
  if (type.includes('zip') || type.includes('archive') || type.includes('compressed')) return Archive;
  return FileIcon;
};

// Generate preview for images
const generatePreview = (file: File): Promise<string | undefined> => {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve(undefined);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => resolve(undefined);
    reader.readAsDataURL(file);
  });
};

// File preview card component
const FilePreviewCard: React.FC<{
  filePreview: FilePreview;
  onRemove: () => void;
}> = ({ filePreview, onRemove }) => {
  const Icon = getFileIcon(filePreview.file.type);
  
  return (
    <div
      className={cn(
        "relative group p-3 rounded-lg border bg-card/50 animate-in fade-in zoom-in-95 duration-200",
        "hover:bg-card/80 transition-colors",
        filePreview.error && "border-destructive/50 bg-destructive/5"
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
      </Button>

      <div className="flex items-center gap-3">
        {/* Preview or icon */}
        <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0">
          {filePreview.preview ? (
            <img 
              src={filePreview.preview} 
              alt={filePreview.file.name} 
              className="w-full h-full object-cover"
            />
          ) : (
            <Icon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        {/* File info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" title={filePreview.file.name}>
            {filePreview.file.name}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatBytes(filePreview.file.size)}</span>
            {filePreview.isCalculatingChecksum && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3 animate-pulse" />
                  {Math.round(filePreview.checksumProgress)}%
                </span>
              </>
            )}
            {filePreview.checksum && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1 text-emerald-500">
                  <Check className="h-3 w-3" />
                  Verified
                </span>
              </>
            )}
          </div>
          {filePreview.error && (
            <p className="text-xs text-destructive mt-1">{filePreview.error}</p>
          )}
        </div>
      </div>

      {/* Checksum progress */}
      {filePreview.isCalculatingChecksum && (
        <Progress 
          value={filePreview.checksumProgress} 
          className="h-1 mt-2"
        />
      )}
    </div>
  );
};

export const SmartDropZone: React.FC<SmartDropZoneProps> = ({
  currentFolder = '',
  onUploadStart,
  onUploadComplete,
  maxFileSize = 5 * 1024 * 1024 * 1024, // 5GB default
  allowedTypes,
  maxFiles = 100,
  showPreviews = true,
  className
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Validate file
  const validateFile = useCallback((file: File): string | null => {
    if (file.size > maxFileSize) {
      return `File too large (max ${formatBytes(maxFileSize)})`;
    }
    
    if (allowedTypes && allowedTypes.length > 0) {
      const isAllowed = allowedTypes.some(type => {
        if (type.startsWith('.')) {
          return file.name.toLowerCase().endsWith(type.toLowerCase());
        }
        return file.type.match(new RegExp(type.replace('*', '.*')));
      });
      
      if (!isAllowed) {
        return `File type not allowed`;
      }
    }
    
    return null;
  }, [maxFileSize, allowedTypes]);

  // Add files
  const addFiles = useCallback(async (newFiles: File[]) => {
    const currentCount = files.length;
    const availableSlots = maxFiles - currentCount;
    
    if (newFiles.length > availableSlots) {
      toast({
        title: "Too many files",
        description: `Maximum ${maxFiles} files allowed`,
        variant: "destructive"
      });
      newFiles = newFiles.slice(0, availableSlots);
    }

    const filePreviews: FilePreview[] = await Promise.all(
      newFiles.map(async (file) => {
        const error = validateFile(file);
        const preview = await generatePreview(file);
        
        return {
          id: crypto.randomUUID(),
          file,
          preview,
          isCalculatingChecksum: false,
          checksumProgress: 0,
          error: error || undefined
        };
      })
    );

    setFiles(prev => [...prev, ...filePreviews]);

    // Calculate checksums for valid files (in background)
    filePreviews
      .filter(fp => !fp.error)
      .forEach(fp => {
        calculateChecksumForFile(fp.id);
      });
  }, [files.length, maxFiles, validateFile, toast]);

  // Calculate checksum for a file
  const calculateChecksumForFile = useCallback(async (id: string) => {
    setFiles(prev => prev.map(f => 
      f.id === id ? { ...f, isCalculatingChecksum: true, checksumProgress: 0 } : f
    ));

    try {
      const file = files.find(f => f.id === id)?.file;
      if (!file) return;

      const checksum = await calculateFileChecksum(file, (progress) => {
        setFiles(prev => prev.map(f => 
          f.id === id ? { ...f, checksumProgress: progress } : f
        ));
      });

      setFiles(prev => prev.map(f => 
        f.id === id ? { ...f, checksum, isCalculatingChecksum: false, checksumProgress: 100 } : f
      ));
    } catch (error) {
      setFiles(prev => prev.map(f => 
        f.id === id ? { ...f, isCalculatingChecksum: false, error: 'Checksum failed' } : f
      ));
    }
  }, [files]);

  // Remove file
  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const items = e.dataTransfer.items;
    const droppedFiles: File[] = [];

    // Handle both files and folders
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) droppedFiles.push(file);
      }
    }

    if (droppedFiles.length > 0) {
      addFiles(droppedFiles);
    }
  }, [addFiles]);

  // Handle file input change
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      addFiles(selectedFiles);
    }
    e.target.value = ''; // Reset input
  }, [addFiles]);

  // Start upload
  const startUpload = useCallback(async () => {
    const validFiles = files.filter(f => !f.error);
    if (validFiles.length === 0) return;

    setIsUploading(true);
    onUploadStart?.(validFiles.map(f => f.file));

    try {
      // Add all files to the smart transfer queue
      for (const filePreview of validFiles) {
        await smartTransferQueue.addUpload(
          filePreview.file,
          currentFolder,
          'normal'
        );
      }

      // Clear the file list
      setFiles([]);
      
      toast({
        title: "Upload Started",
        description: `${validFiles.length} file${validFiles.length > 1 ? 's' : ''} added to transfer queue`
      });

      onUploadComplete?.();
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  }, [files, currentFolder, onUploadStart, onUploadComplete, toast]);

  const validFilesCount = files.filter(f => !f.error).length;
  const hasErrors = files.some(f => f.error);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-8 transition-all duration-200",
          "bg-muted/30 hover:bg-muted/50",
          isDragOver && "border-primary bg-primary/5 scale-[1.02]",
          files.length > 0 && "p-4"
        )}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div
            className="absolute inset-0 bg-primary/10 rounded-xl flex items-center justify-center z-10 animate-in fade-in duration-150"
          >
            <div className="text-center">
              <Upload className="h-12 w-12 mx-auto text-primary mb-2 animate-bounce" />
              <p className="text-lg font-medium text-primary">Drop files here</p>
            </div>
          </div>
        )}

        {files.length === 0 ? (
          /* Empty state */
          <div className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">
              Drop files here to upload
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              or use the buttons below to browse
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileIcon className="h-4 w-4 mr-2" />
                Select Files
              </Button>
              <Button
                variant="outline"
                onClick={() => folderInputRef.current?.click()}
              >
                <FolderUp className="h-4 w-4 mr-2" />
                Select Folder
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Max file size: {formatBytes(maxFileSize)} • Max files: {maxFiles}
            </p>
          </div>
        ) : (
          /* Files preview */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">
                {files.length} file{files.length > 1 ? 's' : ''} selected
                {hasErrors && (
                  <span className="text-destructive text-sm ml-2">
                    ({files.filter(f => f.error).length} with errors)
                  </span>
                )}
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add more
              </Button>
            </div>

            {showPreviews && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                {files.map(filePreview => (
                  <FilePreviewCard
                    key={filePreview.id}
                    filePreview={filePreview}
                    onRemove={() => removeFile(filePreview.id)}
                  />
                ))}
              </div>
            )}

            {/* Upload button */}
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="text-sm text-muted-foreground">
                <span>{validFilesCount} ready to upload</span>
                <span className="mx-2">•</span>
                <span>
                  {formatBytes(files.filter(f => !f.error).reduce((sum, f) => sum + f.file.size, 0))} total
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setFiles([])}
                >
                  Clear all
                </Button>
                <Button
                  onClick={startUpload}
                  disabled={validFilesCount === 0 || isUploading}
                >
                  {isUploading ? (
                    <>Processing...</>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload {validFilesCount} file{validFilesCount > 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
        accept={allowedTypes?.join(',')}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
        // @ts-ignore - webkitdirectory is not in the types
        webkitdirectory=""
        directory=""
      />
    </div>
  );
};

export default SmartDropZone;
